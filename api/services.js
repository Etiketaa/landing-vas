const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('active', true)
      .order('name');

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error fetching services:', err);
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

module.exports = router;
