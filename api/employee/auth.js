const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');
const supabaseAuth = require('../../lib/supabase-auth');
const { mensajeDeError, employeeIdFromUser } = require('../../lib/employee-auth');
const { requireEmployee } = require('../../lib/auth');

// Login de profesionales.
//
// El password lo verifica Supabase Auth, no una tabla nuestra. El cliente de
// supabase-auth.js es el único que puede持久ir sesión: usar el de
// service_role acá volvería a degradar el proceso al JWT de la clienta y las
// escrituras empezarían a fallar por RLS.
router.post('/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = req.body?.password;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });

    if (error || !data?.user) {
      return res.status(401).json({ error: mensajeDeError(error) });
    }

    const user = data.user;

    // Una cuenta puede existir sin estar asociada a una profesional: el admin
    // entra por acá y no tiene employee_id, y también pasa si alguien creó una
    // cuenta desde el panel de Supabase.
    if ((user.app_metadata?.role || user.user_metadata?.role) !== 'employee') {
      return res.status(403).json({ error: 'Esta cuenta no es de una profesional del centro' });
    }

    if (user.app_metadata?.disabled) {
      return res.status(403).json({ error: 'Tu cuenta esta desactivada. Habla con el centro.' });
    }

    const employeeId = employeeIdFromUser(user);
    if (!employeeId) {
      return res.status(403).json({ error: 'Tu cuenta no esta asociada a ninguna profesional' });
    }

    const { data: employee, error: empErr } = await supabase
      .from('employees')
      .select('*')
      .eq('id', employeeId)
      .maybeSingle();

    if (empErr) {
      console.error('Error al cargar la profesional:', empErr.message);
      return res.status(500).json({ error: 'Error al iniciar sesion' });
    }

    if (!employee) {
      return res.status(403).json({ error: 'Tu cuenta no esta asociada a ninguna profesional' });
    }

    if (employee.active === false) {
      return res.status(403).json({ error: 'Tu cuenta esta desactivada. Habla con el centro.' });
    }

    const { data: employeeServices } = await supabase
      .from('employee_services')
      .select('services(name)')
      .eq('employee_id', employee.id);

    const serviceNames = (employeeServices || [])
      .map((es) => es.services?.name)
      .filter(Boolean);

    // Mismo contrato que antes: el micrositio espera { token, employee }, así
    // que el frontend no cambia. El token ahora es un JWT de Supabase en vez de
    // un string opaco.
    res.json({
      token: data.session.access_token,
      expiresAt: data.session.expires_at,
      employee: {
        id: employee.id,
        name: employee.name,
        role: employee.role,
        phone: employee.phone,
        services: serviceNames
      }
    });
  } catch (err) {
    console.error('Error en login de profesional:', err.message);
    res.status(500).json({ error: 'Error al iniciar sesion' });
  }
});

// El token es un JWT sin sesión en el servidor, así que cerrar sesión es
// borrar el token del lado del navegador. La ruta se mantiene porque el
// micrositio la llama y para que más adelante se pueda revocar del lado del
// servidor si hace falta.
router.post('/logout', requireEmployee, async (req, res) => {
  res.json({ message: 'Sesion cerrada' });
});

// Para que el micrositio pueda recuperar la sesión guardada en el navegador sin
// volver a pedir el password: el JWT sigue vivo mientras no expire.
router.get('/me', requireEmployee, async (req, res) => {
  try {
    const { data: employeeServices } = await supabase
      .from('employee_services')
      .select('services(name)')
      .eq('employee_id', req.employee.id);

    res.json({
      employee: {
        id: req.employee.id,
        name: req.employee.name,
        role: req.employee.role,
        phone: req.employee.phone,
        services: (employeeServices || []).map((es) => es.services?.name).filter(Boolean)
      }
    });
  } catch (err) {
    console.error('Error en /api/employee/auth/me:', err.message);
    res.status(500).json({ error: 'Error al obtener el perfil' });
  }
});

module.exports = router;
