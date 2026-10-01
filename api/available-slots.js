const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { calculatePrice } = require('../lib/pricing');
const {
  getScheduleForDate,
  getBookedIntervals,
  intervalsForEmployee,
  isSlotFree,
  generateSlots,
  minutesToTime
} = require('../lib/schedule');
const { forEmployee } = require('../lib/colors');
const { expireUnpaidBookings } = require('../lib/expire-unpaid');

// Profesionales activas que ofrecen el servicio. El color sale del id, así que
// la landing puede pintar cada nombre igual que la agenda del centro.
async function employeesForService(serviceId) {
  const { data: links, error } = await supabase
    .from('employee_services')
    .select('employee_id')
    .eq('service_id', serviceId);

  if (error) throw error;

  const ids = [...new Set((links || []).map(l => l.employee_id))];
  if (ids.length === 0) return [];

  const { data: emps, error: empError } = await supabase
    .from('employees')
    .select('id, name')
    .eq('active', true)
    .in('id', ids)
    .order('name');

  if (empError) throw empError;

  return (emps || []).map(e => ({ id: e.id, name: e.name, color: forEmployee(e).color }));
}

router.get('/', async (req, res) => {
  try {
    const { date, service_id, employee_id } = req.query;

    if (!date || !service_id) {
      return res.status(400).json({ error: 'Fecha y servicio son requeridos' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Formato de fecha inválido' });
    }

    // Antes de leer la agenda, libera los turnos con la seña vencida. Si no, un
    // horario que alguien reservó y abandoné queda ocupado para siempre.
    await expireUnpaidBookings();

    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('id, name, duration_minutes')
      .eq('id', service_id)
      .single();

    if (serviceError || !service) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    const duration = service.duration_minutes || 30;

    const employees = await employeesForService(service_id);

    if (employee_id && !employees.some(e => e.id === employee_id)) {
      return res.status(400).json({ error: 'La profesional elegida no ofrece ese servicio' });
    }

    const schedule = await getScheduleForDate(date);
    const intervals = await getBookedIntervals(date);

    // Para cada horario se calcula qué profesionales están libres durante toda
    // la duración del servicio. Antes `available` se medía contra el centro
    // entero (una sola profesional ocupada marcaba el horario como tomado),
    // así que no se podía ofrecer el mismo servicio con otra que sí tenía
    // lugar. Ahora:
    //   - sin profesional elegida, el horario sirve si al menos una está libre;
    //   - con profesional elegida, sirve sólo si ELLA está libre.
    let rawSlots;
    if (schedule.closed) {
      rawSlots = [];
    } else if (employees.length === 0) {
      // Ninguna profesional ofrece el servicio: no hay a quién asignarlo, así
      // que se conserva el criterio conservador y bloquea contra todo el centro.
      rawSlots = generateSlots(schedule, duration, intervals)
        .map(slot => ({ ...slot, available_employees: [] }));
    } else {
      rawSlots = generateSlots(schedule, duration, []).map(slot => {
        const libres = employees.filter(e =>
          isSlotFree(slot.startMinutes, duration, intervalsForEmployee(intervals, e.id))
        );

        const available = employee_id
          ? libres.some(e => e.id === employee_id)
          : libres.length > 0;

        return {
          time: slot.time,
          startMinutes: slot.startMinutes,
          endMinutes: slot.endMinutes,
          available,
          available_employees: libres.map(e => e.id)
        };
      });
    }

    // El precio se calcula con la hora REAL de cada horario. Antes se fijaba
    // '10:00' para todos los slots, asi que la landing mostraba un precio que
    // no era el que se cobraba al reservar.
    const slots = await Promise.all(rawSlots.map(async (slot) => {
      const price = await calculatePrice(service_id, date, slot.time);
      return {
        time: slot.time,
        available: slot.available,
        available_employees: slot.available_employees,
        final_price: price.final_price,
        applied_rules: price.applied_rules.map(r => r.name)
      };
    }));

    const available = slots.filter(s => s.available);
    // `final_price` de primer nivel = precio del primer horario libre, que es
    // lo que el cliente ve por defecto en el select.
    const reference = available[0] || slots[0] || null;
    const referencePrice = reference
      ? await calculatePrice(service_id, date, reference.time)
      : null;

    res.json({
      date,
      service_id,
      service_name: service.name,
      duration_minutes: duration,
      employees,
      base_price: referencePrice ? referencePrice.base_price : 0,
      final_price: referencePrice ? referencePrice.final_price : 0,
      price_breakdown: {
        base: referencePrice ? referencePrice.base_price : 0,
        applied_rules: referencePrice ? referencePrice.applied_rules : []
      },
      schedule: {
        closed: schedule.closed,
        reason: schedule.reason || null,
        source: schedule.source,
        open: schedule.closed ? null : minutesToTime(schedule.openMinutes),
        close: schedule.closed ? null : minutesToTime(schedule.closeMinutes)
      },
      slots
    });
  } catch (err) {
    console.error('Error fetching available slots:', err.message || err);
    res.status(500).json({ error: 'Error al obtener slots disponibles' });
  }
});

module.exports = router;
