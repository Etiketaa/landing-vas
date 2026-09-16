const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');
const { requireAdmin } = require('../../lib/auth');
const bcrypt = require('bcryptjs');

router.use(requireAdmin);

// ==================== SERVICES ====================
router.get('/services', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('name');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

router.post('/services', async (req, res) => {
  try {
    const { name, description, base_price, duration_minutes, deposit_percent, commission_percent, category, active } = req.body;

    if (!name || !base_price || !duration_minutes) {
      return res.status(400).json({ error: 'Nombre, precio y duracion requeridos' });
    }

    const { data, error } = await supabase
      .from('services')
      .insert({ name, description, base_price, duration_minutes, deposit_percent: deposit_percent || 0, commission_percent: commission_percent || 0, category, active })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear servicio' });
  }
});

router.put('/services/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, base_price, duration_minutes, deposit_percent, commission_percent, category, active } = req.body;

    const { data, error } = await supabase
      .from('services')
      .update({ name, description, base_price, duration_minutes, deposit_percent: deposit_percent || 0, commission_percent: commission_percent || 0, category, active })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar servicio' });
  }
});

router.delete('/services/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await supabase.from('employee_services').delete().eq('service_id', id);
    await supabase.from('bookings').delete().eq('service_id', id);

    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Servicio eliminado' });
  } catch (err) {
    console.error('Delete service error:', err);
    res.status(500).json({ error: 'Error al eliminar servicio' });
  }
});

// ==================== PRICING RULES ====================
router.get('/pricing-rules', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pricing_rules')
      .select('*')
      .order('priority', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener reglas' });
  }
});

router.post('/pricing-rules', async (req, res) => {
  try {
    const { name, rule_type, conditions, value, priority, active, valid_from, valid_until } = req.body;

    if (!name || !rule_type || !conditions || value === undefined) {
      return res.status(400).json({ error: 'Campos requeridos faltantes' });
    }

    const { data, error } = await supabase
      .from('pricing_rules')
      .insert({ name, rule_type, conditions, value, priority, active, valid_from, valid_until })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear regla' });
  }
});

router.put('/pricing-rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, rule_type, conditions, value, priority, active, valid_from, valid_until } = req.body;

    const { data, error } = await supabase
      .from('pricing_rules')
      .update({ name, rule_type, conditions, value, priority, active, valid_from, valid_until })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar regla' });
  }
});

router.delete('/pricing-rules/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('pricing_rules')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Regla eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar regla' });
  }
});

// ==================== EMPLOYEES ====================
router.get('/employees', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*, employee_services(service_id)')
      .order('name');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener empleados' });
  }
});

router.post('/employees', async (req, res) => {
  try {
    const { name, email, password, phone, cbu, alias, active, service_ids } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nombre requerido' });
    }

    if (email && !password) {
      return res.status(400).json({ error: 'Si proporciona email, la contraseña es requerida' });
    }

    const employeeData = { name, email: email || null, phone, cbu: cbu || null, alias: alias || null, active };
    
    if (password) {
      employeeData.password_hash = await bcrypt.hash(password, 10);
    }

    const { data: employee, error } = await supabase
      .from('employees')
      .insert(employeeData)
      .select()
      .single();

    if (error) throw error;

    if (service_ids && service_ids.length > 0) {
      const insertions = service_ids.map(service_id => ({
        employee_id: employee.id,
        service_id
      }));

      await supabase.from('employee_services').insert(insertions);
    }

    res.status(201).json(employee);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear empleado' });
  }
});

router.put('/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, phone, cbu, alias, active, service_ids } = req.body;

    const updateData = { name, email: email || null, phone, cbu: cbu || null, alias: alias || null, active };
    
    if (password) {
      updateData.password_hash = await bcrypt.hash(password, 10);
    }

    const { data: employee, error } = await supabase
      .from('employees')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await supabase.from('employee_services').delete().eq('employee_id', id);

    if (service_ids && service_ids.length > 0) {
      const insertions = service_ids.map(service_id => ({
        employee_id: id,
        service_id
      }));

      await supabase.from('employee_services').insert(insertions);
    }

    res.json(employee);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar empleado' });
  }
});

router.delete('/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await supabase.from('employee_services').delete().eq('employee_id', id);

    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Empleado eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar empleado' });
  }
});

module.exports = router;
