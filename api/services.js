const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { forEmployee } = require('../lib/colors');

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

// Profesionales activas que ofrecen este servicio, para el selector de la
// landing. Sólo sale nombre e id (y el color derivado): nada de CBU ni alias,
// que eso se muestra recién al pagar la seña y sólo el de la profesional
// asignada.
router.get('/:id/employees', async (req, res) => {
  try {
    const { data: links, error } = await supabase
      .from('employee_services')
      .select('employee_id')
      .eq('service_id', req.params.id);

    if (error) throw error;

    const ids = [...new Set((links || []).map(l => l.employee_id))];
    if (ids.length === 0) return res.json([]);

    const { data: emps, error: empError } = await supabase
      .from('employees')
      .select('id, name')
      .eq('active', true)
      .in('id', ids)
      .order('name');

    if (empError) throw empError;

    res.json((emps || []).map(e => ({
      id: e.id,
      name: e.name,
      color: forEmployee(e).color
    })));
  } catch (err) {
    console.error('Error fetching service employees:', err.message || err);
    res.status(500).json({ error: 'Error al obtener profesionales' });
  }
});

module.exports = router;
