const supabase = require('./supabase');

async function calculatePrice(serviceId, date, time) {
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

  const bookingDate = new Date(`${date}T${time}`);
  const dayOfWeek = bookingDate.getDay();
  const hours = bookingDate.getHours();
  const minutes = bookingDate.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  let finalPrice = parseFloat(service.base_price);
  const appliedRules = [];

  for (const rule of rules) {
    const conditions = rule.conditions;
    let applies = false;

    if (conditions.day_of_week && conditions.day_of_week.includes(dayOfWeek)) {
      applies = true;
    }

    if (conditions.time_range) {
      const [startH, startM] = conditions.time_range.start.split(':').map(Number);
      const [endH, endM] = conditions.time_range.end.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      if (timeInMinutes >= startMinutes && timeInMinutes <= endMinutes) {
        applies = true;
      }
    }

    if (conditions.hours_until) {
      const now = new Date();
      const diffHours = (bookingDate - now) / (1000 * 60 * 60);
      if (diffHours <= conditions.hours_until) {
        applies = true;
      }
    }

    if (applies) {
      if (rule.rule_type === 'time_multiplier') {
        finalPrice = finalPrice * parseFloat(rule.value);
        appliedRules.push({
          name: rule.name,
          type: rule.rule_type,
          value: rule.value
        });
      } else if (rule.rule_type === 'discount') {
        finalPrice = finalPrice * (1 - parseFloat(rule.value) / 100);
        appliedRules.push({
          name: rule.name,
          type: rule.rule_type,
          value: rule.value
        });
      } else if (rule.rule_type === 'fixed_price') {
        finalPrice = parseFloat(rule.value);
        appliedRules.push({
          name: rule.name,
          type: rule.rule_type,
          value: rule.value
        });
      }
    }
  }

  finalPrice = Math.round(finalPrice * 100) / 100;

  return {
    service_id: serviceId,
    service_name: service.name,
    base_price: parseFloat(service.base_price),
    final_price: finalPrice,
    duration_minutes: service.duration_minutes,
    applied_rules: appliedRules
  };
}

module.exports = { calculatePrice };
