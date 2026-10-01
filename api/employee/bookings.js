const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');
const { requireEmployee } = require('../../lib/auth');
const { forEmployee } = require('../../lib/colors');

// La profesional ve únicamente sus propios turnos: el filtro por employee_id
// sale de la cuenta verificada, no de un parámetro que ella pueda cambiar.
router.use(requireEmployee);

router.get('/bookings', async (req, res) => {
  try {
    const { date } = req.query;
    const today = date || new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('bookings')
      .select('*, services(name, base_price, duration_minutes)')
      .eq('employee_id', req.employee.id)
      .eq('booking_date', today)
      .neq('status', 'cancelled')
      .order('booking_time');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener reservas' });
  }
});

router.get('/bookings/all', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, services(name, base_price, duration_minutes)')
      .eq('employee_id', req.employee.id)
      .neq('status', 'cancelled')
      .order('booking_date', { ascending: false })
      .order('booking_time');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener reservas' });
  }
});

router.put('/bookings/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['completed', 'cancelled'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Estado no permitido' });
    }

    // Postgres rechaza un id que no sea uuid con un error de sintaxis, que
    // llegaba al catch y se traducía en un 500 sin contexto. Se valida antes.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')) {
      return res.status(404).json({ error: 'El turno no existe' });
    }

    const { data: booking, error: findErr } = await supabase
      .from('bookings')
      .select('employee_id, booking_date, booking_time, client_name')
      .eq('id', id)
      .maybeSingle();

    if (findErr) throw findErr;

    // Antes esto reventaba con TypeError si el turno no existía y devolvía 500.
    if (!booking) {
      return res.status(404).json({ error: 'El turno no existe' });
    }

    if (booking.employee_id !== req.employee.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { data, error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    console.log(
      `[empleado] ${req.employee.name} marco ${booking.booking_date} ${booking.booking_time} ` +
      `de ${booking.client_name} como ${status}`
    );

    res.json({ ...data, color: forEmployee(req.employee) });
  } catch (err) {
    console.error('Error al actualizar reserva de profesional:', err.message);
    res.status(500).json({ error: 'Error al actualizar reserva' });
  }
});

router.get('/profile', async (req, res) => {
  res.json({ ...req.employee, color: forEmployee(req.employee) });
});

module.exports = router;
