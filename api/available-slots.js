const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { calculatePrice } = require('../lib/pricing');

router.get('/', async (req, res) => {
  try {
    const { date, service_id } = req.query;

    if (!date || !service_id) {
      return res.status(400).json({ error: 'Fecha y servicio son requeridos' });
    }

    const priceInfo = await calculatePrice(service_id, date, '10:00');

    const { data: existingBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('booking_time, service_id')
      .eq('booking_date', date)
      .in('status', ['pending', 'confirmed']);

    if (bookingsError) throw bookingsError;

    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('duration_minutes')
      .eq('id', service_id)
      .single();

    if (serviceError || !service) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    const slots = generateAvailableSlots(
      date,
      service.duration_minutes,
      existingBookings || []
    );

    res.json({
      date,
      service_id,
      service_name: priceInfo.service_name,
      base_price: priceInfo.base_price,
      final_price: priceInfo.final_price,
      price_breakdown: {
        base: priceInfo.base_price,
        applied_rules: priceInfo.applied_rules
      },
      slots
    });
  } catch (err) {
    console.error('Error fetching available slots:', err);
    res.status(500).json({ error: 'Error al obtener slots disponibles' });
  }
});

function generateAvailableSlots(date, durationMinutes, existingBookings) {
  const slots = [];
  const startHour = 10;
  const endHour = 20;
  const slotInterval = 30;

  for (let hour = startHour; hour < endHour; hour++) {
    for (let minute = 0; minute < 60; minute += slotInterval) {
      const slotTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const slotDateTime = new Date(`${date}T${slotTime}`);
      const slotEndDateTime = new Date(slotDateTime.getTime() + durationMinutes * 60000);

      if (slotEndDateTime.getHours() > endHour ||
        (slotEndDateTime.getHours() === endHour && slotEndDateTime.getMinutes() > 0)) {
        continue;
      }

      const isAvailable = !existingBookings.some(booking => {
        const bookingTime = booking.booking_time;
        const bookingDateTime = new Date(`${date}T${bookingTime}`);
        const bookingService = booking.service_id;
        const bookingDuration = 30;

        const bookingEndDateTime = new Date(bookingDateTime.getTime() + bookingDuration * 60000);

        return slotDateTime < bookingEndDateTime && slotEndDateTime > bookingDateTime;
      });

      slots.push({
        time: slotTime,
        available: isAvailable
      });
    }
  }

  return slots;
}

module.exports = router;
