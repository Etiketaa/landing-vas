const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    const { data: employee, error } = await supabase
      .from('employees')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('active', true)
      .single();

    if (error || !employee) {
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }

    const validPassword = await bcrypt.compare(password, employee.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    
    await supabase.from('employee_sessions').insert({
      employee_id: employee.id,
      token,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });

    const { data: employeeServices } = await supabase
      .from('employee_services')
      .select('services(name)')
      .eq('employee_id', employee.id);

    const serviceNames = employeeServices ? employeeServices.map(es => es.services?.name).filter(Boolean) : [];

    res.json({
      token,
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        services: serviceNames
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al iniciar sesion' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      await supabase.from('employee_sessions').delete().eq('token', token);
    }
    res.json({ message: 'Sesion cerrada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al cerrar sesion' });
  }
});

module.exports = router;
