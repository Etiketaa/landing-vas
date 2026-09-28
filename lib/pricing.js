const supabase = require('./supabase');
const { timeToMinutes } = require('./schedule');

// Condiciones que el motor sabe evaluar. Si una regla trae algo fuera de esta
// lista se reporta en `unsupported_conditions` en vez de ignorarse en silencio:
// antes una condicion desconocida pasaba por applies=true y aplicaba el descuento.
const SUPPORTED_CONDITIONS = new Set([
  'day_of_week',
  'time_range',
  'hours_until',
  'min_services',
  'category',
  'service_ids'
]);

function isValidOnDate(rule, bookingDate) {
  // `valid_from` / `valid_until` existen en la tabla pero nunca se leyeron:
  // una regla con vencimiento aplicaba para siempre.
  if (rule.valid_from) {
    const from = new Date(`${rule.valid_from}T00:00:00`);
    if (bookingDate < from) return false;
  }
  if (rule.valid_until) {
    // Fin inclusivo: el turno del mismo dia del vencimiento sigue entrando.
    const until = new Date(`${rule.valid_until}T23:59:59`);
    if (bookingDate > until) return false;
  }
  return true;
}

function matchesTimeRange(conditions, timeInMinutes) {
  const start = timeToMinutes(conditions.time_range.start);
  const end = timeToMinutes(conditions.time_range.end);
  if (start === null || end === null) return false;
  return timeInMinutes >= start && timeInMinutes <= end;
}

function matchesHoursUntil(conditions, bookingDate, now) {
  const threshold = Number(conditions.hours_until);
  if (!Number.isFinite(threshold)) return false;

  const diffHours = (bookingDate.getTime() - now.getTime()) / 3600000;
  // Antes faltaba el guard `>= 0`: un turno ya pasado entrava como
  // "ultimo momento" y recibia el descuento.
  return diffHours >= 0 && diffHours <= threshold;
}

/**
 * Evalua una regla. Semantica AND: si la regla trae varias condiciones,
 * TODAS deben cumplirse. Antes se compartia un unico booleano `applies`,
 * asi que bastaba con que se cumpliera una para aplicar el descuento.
 */
function evaluateRule(rule, context) {
  const conditions = rule.conditions || {};
  const keys = Object.keys(conditions).filter(k => conditions[k] !== null && conditions[k] !== undefined);

  const unsupported = keys.filter(k => !SUPPORTED_CONDITIONS.has(k));
  if (unsupported.length > 0) {
    return { applies: false, unsupported };
  }

  if (!isValidOnDate(rule, context.bookingDate)) {
    return { applies: false, unsupported: [] };
  }

  for (const key of keys) {
    switch (key) {
      case 'day_of_week': {
        const days = Array.isArray(conditions.day_of_week) ? conditions.day_of_week : [conditions.day_of_week];
        if (!days.map(Number).includes(context.dayOfWeek)) return { applies: false, unsupported: [] };
        break;
      }
      case 'time_range':
        if (!matchesTimeRange(conditions, context.timeInMinutes)) return { applies: false, unsupported: [] };
        break;
      case 'hours_until':
        if (!matchesHoursUntil(conditions, context.bookingDate, context.now)) return { applies: false, unsupported: [] };
        break;
      case 'min_services':
        if (context.serviceCount < Number(conditions.min_services)) return { applies: false, unsupported: [] };
        break;
      case 'category':
        if (String(conditions.category) !== String(context.category)) return { applies: false, unsupported: [] };
        break;
      case 'service_ids':
        if (!Array.isArray(conditions.service_ids) || !conditions.service_ids.includes(context.serviceId)) {
          return { applies: false, unsupported: [] };
        }
        break;
      default:
        return { applies: false, unsupported: [key] };
    }
  }

  return { applies: true, unsupported: [] };
}

function applyRule(currentPrice, rule) {
  const value = parseFloat(rule.value);

  switch (rule.rule_type) {
    case 'time_multiplier':
    case 'multiplier':
      return currentPrice * value;
    case 'discount':
      return currentPrice * (1 - value / 100);
    case 'surcharge':
      return currentPrice * (1 + value / 100);
    case 'fixed_price':
      return value;
    default:
      // Tipo desconocido: no se toca el precio pero tampoco se rompe la reserva.
      return currentPrice;
  }
}

/**
 * Calcula el precio de un servicio para una fecha/hora concreta.
 *
 * context.serviceCount permite reglas del tipo "2do servicio". Ojo: el modelo
 * actual tiene UN service_id por booking, asi que desde la landing siempre
 * llega 1 y una regla `min_services: 2` nunca se va a cumplir. Se soporta para
 * cuando exista la reserva multi-servicio, no como functionality activa hoy.
 */
async function calculatePrice(serviceId, date, time, context = {}) {
  const { data: service, error: serviceError } = await supabase
    .from('services')
    .select('*')
    .eq('id', serviceId)
    .single();

  if (serviceError || !service) {
    throw new Error('Servicio no encontrado');
  }

  const { data: rules, error: rulesError } = await supabase
    .from('pricing_rules')
    .select('*')
    .eq('active', true)
    .order('priority', { ascending: false });

  if (rulesError) {
    throw new Error('Error al obtener reglas de precio');
  }

  // Anclamos el parseo a una zona horaria estable para que el dia de la semana
  // y la hora no dependan del TZ del servidor (Vercel corre en UTC).
  const [y, m, d] = String(date).split('-').map(Number);
  const [hh, mm] = String(time).split(':').map(Number);
  const bookingDate = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);

  const evalContext = {
    bookingDate,
    now: context.now || new Date(),
    dayOfWeek: bookingDate.getDay(),
    timeInMinutes: (hh || 0) * 60 + (mm || 0),
    serviceId,
    category: service.category || null,
    serviceCount: context.serviceCount || 1
  };

  let finalPrice = parseFloat(service.base_price);
  const appliedRules = [];
  const unsupportedConditions = [];

  for (const rule of rules || []) {
    const { applies, unsupported } = evaluateRule(rule, evalContext);

    for (const key of unsupported) {
      if (!unsupportedConditions.some(u => u.rule_id === rule.id && u.condition === key)) {
        unsupportedConditions.push({ rule_id: rule.id, rule_name: rule.name, condition: key });
      }
    }

    if (!applies) continue;

    const before = finalPrice;
    finalPrice = applyRule(finalPrice, rule);

    if (finalPrice === before && parseFloat(rule.value) === 0) continue;

    appliedRules.push({
      id: rule.id,
      name: rule.name,
      type: rule.rule_type,
      value: rule.value
    });
  }

  if (finalPrice < 0) finalPrice = 0;
  finalPrice = Math.round(finalPrice * 100) / 100;

  return {
    service_id: serviceId,
    service_name: service.name,
    base_price: parseFloat(service.base_price),
    final_price: finalPrice,
    duration_minutes: service.duration_minutes,
    deposit_percent: service.deposit_percent || 0,
    applied_rules: appliedRules,
    unsupported_conditions: unsupportedConditions
  };
}

module.exports = { calculatePrice };
