const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { calculatePrice } = require('../lib/pricing');
const { getScheduleForDate, getBookedIntervals, generateSlots, minutesToTime } = require('../lib/schedule');

router.get('/', async (req, res) => {
  try {
    const { date, service_id } = req.query;

    if (!date || !service_id) {
      return res.status(400).json({ error: 'Fecha y servicio son requeridos' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Formato de fecha inválido' });
    }

    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('id, name, duration_minutes')
      .eq('id', service_id)
      .single();

    if (serviceError || !service) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    const duration = service.duration_minutes || 30;

    const schedule = await getScheduleForDate(date);
    const intervals = await getBookedIntervals(date);

    const rawSlots = schedule.closed
      ? []
      : generateSlots(schedule, duration, intervals);

    // El precio se calcula con la hora REAL de cada horario. Antes se fijaba
    // '10:00' para todos los slots, asi que la landing mostraba un precio que
    // no era el que se cobraba al reservar.
    const slots = await Promise.all(rawSlots.map(async (slot) => {
      const price = await calculatePrice(service_id, date, slot.time);
      return {
        time: slot.time,
        available: slot.available,
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
