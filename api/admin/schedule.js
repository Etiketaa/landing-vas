const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');
const { requireAdmin } = require('../../lib/auth');

router.use(requireAdmin);

// ==================== SCHEDULE ====================
router.get('/schedule', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('business_hours')
      .select('*')
      .order('day_of_week');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener horarios' });
  }
});

router.put('/schedule', async (req, res) => {
  try {
    const { hours } = req.body;

    if (!hours || !Array.isArray(hours)) {
      return res.status(400).json({ error: 'Horarios requeridos' });
    }

    await supabase.from('business_hours').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    const insertions = hours.map(h => ({
      day_of_week: h.day_of_week,
      open_time: h.open_time,
      close_time: h.close_time,
      active: h.active !== false
    }));

    const { data, error } = await supabase
      .from('business_hours')
      .insert(insertions)
      .select();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar horarios' });
  }
});

router.get('/schedule/exceptions', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('schedule_exceptions')
      .select('*')
      .order('exception_date', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener excepciones' });
  }
});

router.post('/schedule/exceptions', async (req, res) => {
  try {
    const { exception_date, is_closed, custom_open, custom_close, reason } = req.body;

    if (!exception_date) {
      return res.status(400).json({ error: 'Fecha requerida' });
    }

    const { data, error } = await supabase
      .from('schedule_exceptions')
      .insert({ exception_date, is_closed, custom_open, custom_close, reason })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear excepcion' });
  }
});

router.delete('/schedule/exceptions/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('schedule_exceptions')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Excepcion eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar excepcion' });
  }
});

// ==================== BOOKINGS ====================
router.get('/bookings', async (req, res) => {
  try {
    const { date, status, employee_id, from, to } = req.query;

    let query = supabase
      .from('bookings')
      .select('*, services(name, duration_minutes), employees(name)');

    if (date) query = query.eq('booking_date', date);
    if (status) query = query.eq('status', status);
    if (employee_id) query = query.eq('employee_id', employee_id);
    if (from && to) {
      query = query.gte('booking_date', from).lte('booking_date', to);
    }

    const { data, error } = await query.order('booking_date').order('booking_time');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener reservas' });
  }
});

router.post('/bookings', async (req, res) => {
  try {
    const { client_name, client_contact, service_id, employee_id, booking_date, booking_time, notes, payment_method } = req.body;

    if (!client_name || !client_contact || !service_id || !booking_date || !booking_time) {
      return res.status(400).json({ error: 'Campos requeridos faltantes' });
    }

    let assignedEmployeeId = employee_id;
    if (!assignedEmployeeId) {
      const { data: assignedPro } = await supabase
        .from('employee_services')
        .select('employee_id')
        .eq('service_id', service_id)
        .single();
      assignedEmployeeId = assignedPro?.employee_id || null;
    }

    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('booking_date', booking_date)
      .eq('booking_time', booking_time)
      .in('status', ['pending', 'confirmed'])
      .single();

    if (existingBooking) {
      return res.status(409).json({ error: 'Este horario ya esta reservado' });
    }

    const { data: service } = await supabase
      .from('services')
      .select('base_price')
      .eq('id', service_id)
      .single();

    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        client_name,
        client_contact,
        service_id,
        employee_id: assignedEmployeeId,
        booking_date,
        booking_time,
        final_price: service?.base_price || 0,
        notes,
        payment_method,
        status: 'confirmed'
      })
      .select('*, services(name)')
      .single();

    if (error) throw error;
    res.status(201).json(booking);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear reserva' });
  }
});

router.put('/bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { client_name, client_contact, service_id, employee_id, booking_date, booking_time, notes, payment_method, paid } = req.body;

    const { data, error } = await supabase
      .from('bookings')
      .update({ client_name, client_contact, service_id, employee_id, booking_date, booking_time, notes, payment_method, paid })
      .eq('id', id)
      .select('*, services(name)')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar reserva' });
  }
});

router.put('/bookings/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Estado invalido' });
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
    res.status(500).json({ error: 'Error al cambiar estado' });
  }
});

module.exports = router;
