const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');

async function requireEmployeeAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = authHeader.replace('Bearer ', '');

  const { data: session, error } = await supabase
    .from('employee_sessions')
    .select('*')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !session) {
    return res.status(401).json({ error: 'Sesion invalida o expirada' });
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('id', session.employee_id)
    .single();

  req.employee = employee;
  next();
}

router.use(requireEmployeeAuth);

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

    const { data: booking } = await supabase
      .from('bookings')
      .select('employee_id')
      .eq('id', id)
      .single();

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
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar reserva' });
  }
});

router.get('/profile', async (req, res) => {
  res.json(req.employee);
});

module.exports = router;
