const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');
const { requireAdmin } = require('../../lib/auth');

router.use(requireAdmin);

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('name');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, email, phone, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nombre requerido' });
    }

    const { data, error } = await supabase
      .from('clients')
      .insert({ name, email: email || null, phone: phone || null, notes: notes || null })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear cliente' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, notes } = req.body;

    const { data, error } = await supabase
      .from('clients')
      .update({ name, email: email || null, phone: phone || null, notes: notes || null })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar cliente' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Cliente eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar cliente' });
  }
});

router.get('/bookings/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;

    const { data, error } = await supabase
      .from('bookings')
      .select('*, services(name, base_price)')
      .eq('client_contact', clientId)
      .order('booking_date', { ascending: false })
      .order('booking_time');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

module.exports = router;
