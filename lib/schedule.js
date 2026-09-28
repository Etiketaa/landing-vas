const supabase = require('./supabase');

// Ventana por defecto si el centro todavia no cargo `business_hours`.
// Evita dejar el sistema sin reservas mientras se configura la agenda.
const FALLBACK_HOURS = { open: '10:00', close: '20:00' };
const DEFAULT_SLOT_INTERVAL = 30;

const ACTIVE_STATUSES = ['pending', 'confirmed', 'pending_payment'];

/**
 * Acepta "10:00", "10:00:00" o "10:00:00.000" (PostgREST devuelve TIME con segundos).
 * Devuelve minutos desde la medianoche, o null si no se puede interpretar.
 */
function timeToMinutes(value) {
  if (value === null || value === undefined) return null;

  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 24 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function dayOfWeekFor(dateStr) {
  // Parseo explicito para no depender del timezone del servidor.
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/**
 * Resuelve la ventana de atencion de una fecha.
 * Prioridad: `schedule_exceptions` del dia (cierre / horario custom)
 *            -> `business_hours` del dia de la semana
 *            -> ventana por defecto (10:00-20:00) para no romper las reservas.
 */
async function getScheduleForDate(dateStr) {
  const dayOfWeek = dayOfWeekFor(dateStr);

  const { data: exceptions, error: exError } = await supabase
    .from('schedule_exceptions')
    .select('*')
    .eq('exception_date', dateStr)
    .limit(1);

  if (exError) throw exError;

  const exception = exceptions && exceptions[0];
  if (exception) {
    if (exception.is_closed) {
      return { closed: true, reason: exception.reason || 'Centro cerrado', source: 'exception', dayOfWeek };
    }

    const open = timeToMinutes(exception.custom_open);
    const close = timeToMinutes(exception.custom_close);
    if (open !== null && close !== null && close > open) {
      return { closed: false, openMinutes: open, closeMinutes: close, source: 'exception', dayOfWeek };
    }
  }

  const { data: hours, error: bhError } = await supabase
    .from('business_hours')
    .select('*')
    .eq('day_of_week', dayOfWeek)
    .eq('active', true)
    .limit(1);

  if (bhError) throw bhError;

  const row = hours && hours[0];
  if (row) {
    const open = timeToMinutes(row.open_time);
    const close = timeToMinutes(row.close_time);
    if (open !== null && close !== null && close > open) {
      return { closed: false, openMinutes: open, closeMinutes: close, source: 'business_hours', dayOfWeek };
    }
  }

  return {
    closed: false,
    openMinutes: timeToMinutes(FALLBACK_HOURS.open),
    closeMinutes: timeToMinutes(FALLBACK_HOURS.close),
    source: 'fallback',
    dayOfWeek
  };
}

/**
 * Intervalos ya ocupados para una fecha, usando la duracion REAL de cada
 * servicio reservado. Antes se asumian 30 minutos fijos, lo que permitia
 * superponer un turno de 90 minutos con el siguiente.
 */
async function getBookedIntervals(dateStr) {
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, booking_time, service_id, employee_id, status')
    .eq('booking_date', dateStr)
    .in('status', ACTIVE_STATUSES);

  if (bookingsError) throw bookingsError;
  if (!bookings || bookings.length === 0) return [];

  const serviceIds = [...new Set(bookings.map(b => b.service_id).filter(Boolean))];
  const { data: services, error: servicesError } = await supabase
    .from('services')
    .select('id, duration_minutes')
    .in('id', serviceIds);

  if (servicesError) throw servicesError;

  const durationByService = new Map(
    (services || []).map(s => [s.id, s.duration_minutes || 30])
  );

  return bookings
    .map(b => {
      const start = timeToMinutes(b.booking_time);
      if (start === null) return null;
      const duration = durationByService.get(b.service_id) || 30;
      return { start, end: start + duration, id: b.id, employeeId: b.employee_id || null };
    })
    .filter(Boolean);
}

function overlaps(slotStart, slotEnd, interval) {
  return slotStart < interval.end && slotEnd > interval.start;
}

function isSlotFree(startMinutes, durationMinutes, intervals) {
  const end = startMinutes + durationMinutes;
  return !intervals.some(interval => overlaps(startMinutes, end, interval));
}

/**
 * Genera los horarios posibles dentro de la ventana de atencion, descartando
 * los que se superponen con un turno existente segun su duracion real.
 */
function generateSlots(schedule, durationMinutes, intervals, slotInterval = DEFAULT_SLOT_INTERVAL) {
  if (schedule.closed) return [];

  const slots = [];
  const step = slotInterval || DEFAULT_SLOT_INTERVAL;

  for (let start = schedule.openMinutes; start + durationMinutes <= schedule.closeMinutes; start += step) {
    slots.push({
      time: minutesToTime(start),
      startMinutes: start,
      endMinutes: start + durationMinutes,
      available: isSlotFree(start, durationMinutes, intervals)
    });
  }

  return slots;
}

/**
 * Chequeo server-side para POST /api/book. Sin esto el endpoint acepta
 * cualquier horario: la landing restringe, pero la API no.
 */
async function validateBookingTime(dateStr, timeStr, durationMinutes) {
  const schedule = await getScheduleForDate(dateStr);
  if (schedule.closed) {
    return { ok: false, status: 409, error: schedule.reason || 'El centro está cerrado ese día' };
  }

  const start = timeToMinutes(timeStr);
  if (start === null) {
    return { ok: false, status: 400, error: 'Horario inválido' };
  }

  const end = start + durationMinutes;
  if (start < schedule.openMinutes || end > schedule.closeMinutes) {
    return {
      ok: false,
      status: 409,
      error: `Ese horario está fuera del horario de atención (${minutesToTime(schedule.openMinutes)} a ${minutesToTime(schedule.closeMinutes)})`
    };
  }

  const intervals = await getBookedIntervals(dateStr);
  if (!isSlotFree(start, durationMinutes, intervals)) {
    return { ok: false, status: 409, error: 'Este horario ya está reservado' };
  }

  return { ok: true, schedule, startMinutes: start, endMinutes: end };
}

module.exports = {
  timeToMinutes,
  minutesToTime,
  getScheduleForDate,
  getBookedIntervals,
  isSlotFree,
  generateSlots,
  validateBookingTime,
  ACTIVE_STATUSES
};
