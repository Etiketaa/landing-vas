const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');
const { requireAdmin } = require('../../lib/auth');
const { forEmployee } = require('../../lib/colors');
const {
  createLogin,
  findLoginByEmployee,
  updatePassword,
  updateEmail,
  disableLogin,
  deleteLogin,
  loginStatusFor
} = require('../../lib/employee-auth');

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

// El color de cada profesional lo calcula lib/colors.js a partir del id, así
// que no hay que elegirlo ni guardarlo. Si algún día se elige a mano se lee de
// employees.color, que viene incluido en el select('*') y aparece como
// undefined si la columna todavía no existe.
router.get('/employees', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*, employee_services(service_id)')
      .order('name');

    if (error) throw error;

    const logins = await loginStatusFor((data || []).map((e) => e.id));

    res.json(
      (data || []).map((e) => ({
        ...e,
        color: forEmployee(e),
        login: logins[e.id] || { tieneLogin: false }
      }))
    );
  } catch (err) {
    console.error('Error al obtener empleados:', err.message);
    res.status(500).json({ error: 'Error al obtener empleados' });
  }
});

router.post('/employees', async (req, res) => {
  let employee = null;

  try {
    const { name, email, password, phone, cbu, alias, active, service_ids } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nombre requerido' });
    }

    // El email es obligatorio: sin él la profesional no tiene forma de entrar a
    // ver sus turnos, que es justo para lo que se la carga.
    if (!email) {
      return res.status(400).json({ error: 'El email es requerido: es con el que va a entrar' });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const emailLimpio = String(email).trim().toLowerCase();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailLimpio)) {
      return res.status(400).json({ error: 'El email no parece válido' });
    }

    // Se chequea antes de insertar para no dejar una fila a medias si el email
    // ya está usado. La carrera —dos altas simultáneas con el mismo email— es
    // acá improbable porque el panel es de un solo usuario.
    const { data: existentes } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emailTomado = (existentes?.users || []).some(
      (u) => (u.email || '').toLowerCase() === emailLimpio
    );
    if (emailTomado) {
      return res.status(400).json({ error: 'Ese email ya tiene una cuenta creada' });
    }

    const { data: creado, error: empErr } = await supabase
      .from('employees')
      .insert({
        name,
        phone: phone || null,
        cbu: cbu || null,
        alias: alias || null,
        active: active === undefined ? true : active
      })
      .select()
      .single();

    if (empErr) throw empErr;
    employee = creado;

    // La cuenta de login va después de la fila porque necesita el id. Si falla,
    // se borra la fila: dejar una profesional sin cuenta es exactamente el
    // estado roto que se quería evitar.
    let login;
    try {
      login = await createLogin({ employeeId: employee.id, email: emailLimpio, password, fullName: name });
    } catch (loginErr) {
      await supabase.from('employees').delete().eq('id', employee.id);
      employee = null;
      console.error('Error creando la cuenta de login:', loginErr.message);
      return res.status(500).json({
        error: 'No se pudo generar el acceso. No quedó nada a medias, probá de nuevo.'
      });
    }

    if (!login.created) {
      await supabase.from('employees').delete().eq('id', employee.id);
      employee = null;
      return res.status(400).json({
        error: login.reason === 'email_duplicado'
          ? 'Ese email ya tiene una cuenta creada'
          : 'No se pudo crear el acceso'
      });
    }

    if (service_ids && service_ids.length > 0) {
      await supabase.from('employee_services').insert(
        service_ids.map((service_id) => ({ employee_id: employee.id, service_id }))
      );
    }

    res.status(201).json({
      ...employee,
      color: forEmployee(employee),
      login: { tieneLogin: true, email: login.email }
    });
  } catch (err) {
    console.error('Error al crear empleado:', err.message);
    if (employee) {
      await supabase.from('employees').delete().eq('id', employee.id);
    }
    res.status(500).json({ error: 'Error al crear profesional' });
  }
});

router.put('/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, phone, cbu, alias, active, service_ids, color } = req.body;

    const updateData = {
      name,
      phone: phone || null,
      cbu: cbu || null,
      alias: alias || null,
      active
    };

    // Sólo se escribe la columna si el panel la mandó. Así el endpoint sigue
    // funcionando antes de aplicar la migración 003, donde `color` todavía no
    // existe: mandar la columna inexistente haría fallar el UPDATE entero.
    if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) {
      updateData.color = color;
    }

    const { data: employee, error } = await supabase
      .from('employees')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // El acceso se actualiza aparte de la fila: son dos sistemas distintos.
    // Email o contraseña nuevos son opcionales; si vienen, se cambian.
    if (email || password) {
      const emailLimpio = email ? String(email).trim().toLowerCase() : null;
      const loginActual = await findLoginByEmployee(id);

      if (emailLimpio && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailLimpio)) {
        return res.status(400).json({ error: 'El email no parece válido' });
      }

      if (password && password.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
      }

      if (!loginActual) {
        if (!emailLimpio || !password) {
          return res.status(400).json({
            error: 'Esta profesional todavia no tiene cuenta. Para crearla hacen falta email y contraseña.'
          });
        }

        const nuevo = await createLogin({ employeeId: id, email: emailLimpio, password, fullName: name });

        if (!nuevo.created) {
          return res.status(400).json({
            error: nuevo.reason === 'email_duplicado'
              ? 'Ese email ya tiene una cuenta creada'
              : 'No se pudo crear el acceso'
          });
        }
      } else {
        if (emailLimpio && emailLimpio !== loginActual.email) {
          await updateEmail(loginActual.id, emailLimpio);
        }
        if (password) {
          await updatePassword(loginActual.id, password);
        }
      }
    }

    await supabase.from('employee_services').delete().eq('employee_id', id);

    if (service_ids && service_ids.length > 0) {
      await supabase.from('employee_services').insert(
        service_ids.map((service_id) => ({ employee_id: id, service_id }))
      );
    }

    res.json({ ...employee, color: forEmployee(employee) });
  } catch (err) {
    console.error('Error al actualizar empleado:', err.message);
    res.status(500).json({ error: 'Error al actualizar profesional' });
  }
});

router.delete('/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: professional } = await supabase
      .from('employees')
      .select('id, name')
      .eq('id', id)
      .maybeSingle();

    if (!professional) {
      return res.status(404).json({ error: 'La profesional no existe' });
    }

    // Con turnos en el historial no se puede borrar la fila: bookings tiene una
    // clave foránea contra employees y Postgres la rechaza. Y no tiene sentido
    // perder el pasado de las comisiones ni los comprobantes de seña. Se da de
    // baja, que es además lo que corresponde: la profesional sigue existiendo,
    // sólo que no atiende más.
    const { count: turnos } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', id);

    if (turnos > 0) {
      // La cuenta se banea, no se borra: el id de cuenta es el mismo que
      // empareja los turnos viejos con la profesional.
      await disableLogin(id);
      await supabase.from('employees').update({ active: false }).eq('id', id);
      await supabase.from('employee_services').delete().eq('employee_id', id);

      return res.json({
        message: `${professional.name} se dio de baja: tiene ${turnos} turno(s) en el historial, que se conservan.`,
        baja: true
      });
    }

    await supabase.from('employee_services').delete().eq('employee_id', id);

    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) throw error;

    // Sin historial la fila desaparece, así que la cuenta también. Antes se
    // bannía primero y después se borraba la fila, con lo que la cuenta
    // sobrevivia sin fila: el siguiente alta del mismo email rebotaba con
    // "ese email ya tiene una cuenta creada" y había que entrar a borrarla a
    // mano del panel de Supabase.
    await deleteLogin(id);

    res.json({ message: `${professional.name} fue eliminada`, baja: false });
  } catch (err) {
    console.error('Error al eliminar empleado:', err.message);
    res.status(500).json({ error: 'Error al eliminar profesional' });
  }
});

module.exports = router;
