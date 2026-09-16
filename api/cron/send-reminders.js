const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');
const resend = require('../../lib/resend');

router.get('/', async (req, res) => {
  try {
    const cronSecret = req.headers['x-cron-secret'] || req.query.secret;
    if (cronSecret !== process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*, services(*)')
      .eq('booking_date', tomorrowStr)
      .in('status', ['confirmed'])
      .eq('reminder_sent', false);

    if (error) throw error;

    let sentCount = 0;

    for (const booking of bookings) {
      try {
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #d4a373;">Recordatorio de turno 📅</h1>
            <p>Hola <strong>${booking.client_name}</strong>,</p>
            <p>Te recordamos que mañana tenés turno en VAS Centro de Estética.</p>
            <div style="background: #fdf6ec; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0;">Detalles:</h3>
              <p style="margin: 5px 0;"><strong>Servicio:</strong> ${booking.services.name}</p>
              <p style="margin: 5px 0;"><strong>Fecha:</strong> ${booking.booking_date}</p>
              <p style="margin: 5px 0;"><strong>Hora:</strong> ${booking.booking_time}</p>
              <p style="margin: 5px 0;"><strong>Precio:</strong> $${booking.final_price.toLocaleString('es-AR')}</p>
            </div>
            <p style="color: #666; font-size: 14px;">
              Si necesitás cancelar o reprogramar, comunicate al menos 2 horas antes.
            </p>
            <p style="margin-top: 20px;">¡Te esperamos! 💛</p>
          </div>
        `;

        await resend.emails.send({
          from: 'VAS Centro de Estética <onboarding@resend.dev>',
          to: [booking.client_contact],
          subject: 'Mañana tenés turno en VAS Centro de Estética',
          html
        });

        await supabase
          .from('bookings')
          .update({ reminder_sent: true })
          .eq('id', booking.id);

        sentCount++;
      } catch (err) {
        console.error(`Error sending reminder for booking ${booking.id}:`, err);
      }
    }

    res.json({
      message: 'Recordatorios procesados',
      date: tomorrowStr,
      total_bookings: bookings.length,
      reminders_sent: sentCount
    });
  } catch (err) {
    console.error('Error in send-reminders cron:', err);
    res.status(500).json({ error: 'Error al enviar recordatorios' });
  }
});

module.exports = router;
