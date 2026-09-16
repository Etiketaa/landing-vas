const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');
const { requireAdmin } = require('../../lib/auth');

router.use(requireAdmin);

// ==================== CASH SESSIONS ====================
router.get('/cash/open', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('status', 'OPEN')
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    res.json(data || null);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener caja' });
  }
});

router.post('/cash/open', async (req, res) => {
  try {
    const { opening_float } = req.body;

    const { data: existing } = await supabase
      .from('cash_sessions')
      .select('id')
      .eq('status', 'OPEN')
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Ya hay una caja abierta' });
    }

    const { data, error } = await supabase
      .from('cash_sessions')
      .insert({
        opened_by: req.user.id,
        opening_float: opening_float || 0,
        status: 'OPEN'
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al abrir caja' });
  }
});

router.post('/cash/movement', async (req, res) => {
  try {
    const { session_id, type, source, booking_id, amount, payment_method, note } = req.body;

    if (!session_id || !type || !amount) {
      return res.status(400).json({ error: 'Sesion, tipo y monto requeridos' });
    }

    const { data: session } = await supabase
      .from('cash_sessions')
      .select('status')
      .eq('id', session_id)
      .single();

    if (!session || session.status !== 'OPEN') {
      return res.status(409).json({ error: 'La caja no esta abierta' });
    }

    const { data, error } = await supabase
      .from('cash_movements')
      .insert({
        session_id,
        type,
        source,
        booking_id,
        amount,
        payment_method: payment_method || 'cash',
        note
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar movimiento' });
  }
});

router.post('/cash/close', async (req, res) => {
  try {
    const { session_id, counted_close } = req.body;

    if (!session_id || counted_close === undefined) {
      return res.status(400).json({ error: 'Sesion y monto contado requeridos' });
    }

    const { data: session } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('status', 'OPEN')
      .single();

    if (!session) {
      return res.status(409).json({ error: 'Sesion no encontrada o ya cerrada' });
    }

    const { data: movements } = await supabase
      .from('cash_movements')
      .select('type, amount')
      .eq('session_id', session_id);

    let totalIn = 0;
    let totalOut = 0;
    (movements || []).forEach(m => {
      if (m.type === 'CASH_IN') totalIn += parseFloat(m.amount);
      else totalOut += parseFloat(m.amount);
    });

    const expected = parseFloat(session.opening_float) + totalIn - totalOut;
    const variance = parseFloat(counted_close) - expected;

    const { data, error } = await supabase
      .from('cash_sessions')
      .update({
        closed_by: req.user.id,
        counted_close,
        expected_close: expected,
        variance,
        status: 'CLOSED',
        closed_at: new Date().toISOString()
      })
      .eq('id', session_id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al cerrar caja' });
  }
});

router.get('/cash/history', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cash_sessions')
      .select('*')
      .order('opened_at', { ascending: false })
      .limit(30);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

router.get('/cash/movements/:session_id', async (req, res) => {
  try {
    const { session_id } = req.params;

    const { data, error } = await supabase
      .from('cash_movements')
      .select('*, bookings(client_name, services(name))')
      .eq('session_id', session_id)
      .order('created_at');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener movimientos' });
  }
});

// ==================== DASHBOARD ====================
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { count: todayBookings } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('booking_date', today)
      .in('status', ['pending', 'confirmed']);

    const { count: totalServices } = await supabase
      .from('services')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);

    const { count: totalEmployees } = await supabase
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);

    const { data: todayBookingsList } = await supabase
      .from('bookings')
      .select('*, services(name, base_price), employees(name)')
      .eq('booking_date', today)
      .in('status', ['pending', 'confirmed'])
      .order('booking_time');

    const { data: openSession } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('status', 'OPEN')
      .single();

    res.json({
      today: todayBookings || 0,
      total_services: totalServices || 0,
      total_employees: totalEmployees || 0,
      today_bookings: todayBookingsList || [],
      cash_session: openSession || null
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener dashboard' });
  }
});

module.exports = router;
