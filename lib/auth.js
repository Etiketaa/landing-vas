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

module.exports = { requireAuth, requireAdmin };
