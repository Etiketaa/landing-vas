const supabase = require('./supabase');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = authHeader.replace('Bearer ', '');

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Token invalido o expirado' });
  }

  req.user = user;
  next();
}

async function requireAdmin(req, res, next) {
  await requireAuth(req, res, async () => {
    const role = req.user.app_metadata?.role || req.user.user_metadata?.role;

    if (role !== 'admin') {
      return res.status(403).json({ error: 'Acceso restringido a administradores' });
    }

    next();
  });
}

// Versión sin middleware: resuelve el usuario del token o devuelve null.
// La usan los endpoints que admiten dos formas de acceso (por ejemplo el
// comprobante, que puede verlo el admin o la propia clienta de la reserva).
async function resolveUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  return user;
}

function isAdmin(user) {
  if (!user) return false;
  const role = user.app_metadata?.role || user.user_metadata?.role;
  return role === 'admin';
}

async function isEmployee(user) {
  if (!user) return false;
  const role = user.app_metadata?.role || user.user_metadata?.role;
  return role === 'employee';
}

// Exige una cuenta de profesional y deja la fila de employees en req.employee.
//
// El id de la profesional sale de app_metadata.employee_id, que el usuario no
// puede editar desde el cliente. Si la fila de employees no existe o está dada
// de baja, la cuenta se rechaza igual: puede quedar una cuenta huérfana si
// alguien la creó desde el panel de Supabase.
async function requireEmployee(req, res, next) {
  await requireAuth(req, res, async () => {
    if (!(await isEmployee(req.user))) {
      return res.status(403).json({ error: 'Acceso restringido a profesionales' });
    }

    if (req.user.app_metadata?.disabled) {
      return res.status(403).json({ error: 'Tu cuenta esta desactivada. Habla con el centro.' });
    }

    const employeeId = require('./employee-auth').employeeIdFromUser(req.user);

    if (!employeeId) {
      return res.status(403).json({ error: 'Tu cuenta no esta asociada a ninguna profesional' });
    }

    const { data: employee, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', employeeId)
      .maybeSingle();

    if (error) {
      console.error('Error al cargar la profesional:', error.message);
      return res.status(500).json({ error: 'Error al verificar la cuenta' });
    }

    if (!employee) {
      return res.status(403).json({ error: 'Tu cuenta no esta asociada a ninguna profesional' });
    }

    if (employee.active === false) {
      return res.status(403).json({ error: 'Tu cuenta esta desactivada. Habla con el centro.' });
    }

    req.employee = employee;
    next();
  });
}

module.exports = { requireAuth, requireAdmin, resolveUser, isAdmin, isEmployee, requireEmployee };
