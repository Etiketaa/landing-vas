const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

router.get('/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, client_name, service_id, employee_id, booking_date, booking_time, final_price, deposit_amount, status, deposit_deadline, services(name)')
      .eq('id', bookingId)
      .single();

    if (error || !booking) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    if (booking.employee_id) {
      const { data: proData } = await supabase
        .from('employees')
        .select('name, cbu, alias')
        .eq('id', booking.employee_id)
        .single();
      booking.professional = proData;
    }

    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener reserva' });
  }
});

router.post('/:bookingId/upload', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { payment_image } = req.body;

    if (!payment_image) {
      return res.status(400).json({ error: 'Comprobante requerido' });
    }

    const { data: booking } = await supabase
      .from('bookings')
      .select('deposit_deadline, status')
      .eq('id', bookingId)
      .single();

    if (!booking) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    if (booking.status !== 'pending_payment') {
      return res.status(400).json({ error: 'Esta reserva ya fue confirmada o cancelada' });
    }

    if (booking.deposit_deadline && new Date(booking.deposit_deadline) < new Date()) {
      await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId);
      return res.status(400).json({ error: 'Tiempo de pago expirado. La reserva fue cancelada.' });
    }

    const { data, error } = await supabase
      .from('bookings')
      .update({
        payment_proof: payment_image,
        payment_uploaded_at: new Date().toISOString(),
        status: 'pending_confirmation'
      })
      .eq('id', bookingId)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Comprobante subido correctamente. Pendiente de confirmación del administrador.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al subir comprobante' });
  }
});

router.post('/:bookingId/confirm', async (req, res) => {
  try {
    const { bookingId } = req.params;

    const { data, error } = await supabase
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', bookingId)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Reserva confirmada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al confirmar reserva' });
  }
});

router.post('/:bookingId/reject', async (req, res) => {
  try {
    const { bookingId } = req.params;

    const { data, error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', payment_proof: null, payment_uploaded_at: null })
      .eq('id', bookingId)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Reserva cancelada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al cancelar reserva' });
  }
});

module.exports = router;
