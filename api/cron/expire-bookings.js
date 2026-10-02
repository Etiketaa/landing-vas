const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');
const { expireUnpaidBookings } = require('../../lib/expire-unpaid');

// Red de seguridad para liberar los horarios de las reservas con la seña vencida.
//
// El barrido principal es oportunista (lib/expire-unpaid.js, invocado desde
// available-slots y book), porque el cron de Vercel en planes gratuitos corre
// una sola vez por día y la ventana de pago es de 10 minutos. Este endpoint
// existe para cuando la instancia queda sin tráfico: sin consultas a la agenda
// tampoco hay barrido, y un turno abandonado seguiría bloqueando el horario.
router.get('/', async (req, res) => {
  try {
    // Vercel manda el CRON_SECRET como `authorization: Bearer <token>`, no como
    // x-cron-secret. Aceptamos ambas formas.
    const authHeader = req.headers['authorization'] || '';
    const cronSecret = req.headers['x-cron-secret'] || req.query.secret || (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);
    if (process.env.NODE_ENV === 'production' && cronSecret !== process.env.CRON_SECRET) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await expireUnpaidBookings();

    if (result.expired === 0) {
      return res.json({ message: 'Sin reservas vencidas', expired: 0 });
    }

    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, client_name, booking_date, booking_time')
      .in('id', result.ids);

    res.json({
      message: 'Reservas vencidas liberadas',
      expired: result.expired,
      bookings: bookings || []
    });
  } catch (err) {
    console.error('Error en expire-bookings:', err.message);
    res.status(500).json({ error: 'Error al liberar reservas vencidas' });
  }
});

module.exports = router;
