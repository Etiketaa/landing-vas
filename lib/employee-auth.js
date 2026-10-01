const supabase = require('./supabase');

// Login de profesionales sobre Supabase Auth, igual que el del centro.
//
// Antes esto se hacía con una columna employees.password_hash y una tabla
// employee_sessions con tokens propios. Las dos columnas no existían en la base
// (sólo estaban en una migración vieja que nunca se aplicó), así que ninguna
// profesional podía entrar. Usar Supabase Auth evita el problema entero:
// no hay DDL que aplicar, el hash de la contraseña lo maneja el servicio en vez
// de guardado en una tabla nuestra, y el token es un JWT real que ya sabemos
// verificar.
//
// El vínculo entre la cuenta de login y la fila de employees es
// app_metadata.employee_id. Va en app_metadata y no en user_metadata a propósito:
// app_metadata no la puede modificar el propio usuario desde el cliente, así
// que una profesional no puede reasignarse el id de otra.

// Traduce los errores de Auth a algo que una persona pueda entender. Supabase
// devuelve texto en inglés y, peor, "Invalid login credentials" tanto para un
// email inexistente como para una contraseña mala: no conviene distinguir,
// porque se podría enumerar qué emails tienen cuenta.
function mensajeDeError(err) {
  const msg = (err?.message || '').toLowerCase();

  if (msg.includes('invalid login credentials')) {
    return 'Email o contraseña incorrectos';
  }
  if (msg.includes('email not confirmed')) {
    return 'La cuenta todavía no está confirmada. Pedile al centro que la habilite.';
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'Demasiados intentos. Esperá un minuto y probá de nuevo.';
  }
  return 'No se pudo iniciar sesión';
}

// El id de la profesional va en app_metadata. Si no está, la cuenta existe pero
// no corresponde a nadie de la lista: puede ser el admin, o una cuenta creada
// a mano desde el panel de Supabase.
function employeeIdFromUser(user) {
  return user?.app_metadata?.employee_id || null;
}

async function findLoginByEmployee(employeeId) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (error) throw error;

  const found = (data?.users || []).find(
    (u) => u.app_metadata?.employee_id === employeeId
  );

  if (!found) return null;

  return {
    id: found.id,
    email: found.email,
    created_at: found.created_at
  };
}

// Crea la cuenta de login. El employeeId se escribe recién después de insertar
// la fila en employees, así que llega siempre.
async function createLogin({ employeeId, email, password, fullName }) {
  if (!email) {
    return { created: false, reason: 'sin_email' };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: String(email).trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { role: 'employee', employee_id: employeeId }
  });

  if (error) {
    // El email repetido es el caso esperado, no una falla rara: lo trata el
    // endpoint que llama a esta función.
    if (/already been registered|already exists/i.test(error.message)) {
      return { created: false, reason: 'email_duplicado' };
    }
    throw error;
  }

  return { created: true, userId: data.user.id, email: data.user.email };
}

// Reengancha una cuenta de login con una profesional. Se usa cuando se crea
// una profesional con un email que ya tenía cuenta (por ejemplo creada desde el
// panel de Supabase) en vez de darle uno nuevo.
async function linkLogin({ employeeId, email, fullName }) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  const found = (data?.users || []).find(
    (u) => (u.email || '').toLowerCase() === String(email).trim().toLowerCase()
  );

  if (!found) {
    return { linked: false, reason: 'no_existe' };
  }

  const { error: updErr } = await supabase.auth.admin.updateUserById(found.id, {
    app_metadata: { role: 'employee', employee_id: employeeId },
    user_metadata: { full_name: fullName }
  });

  if (updErr) throw updErr;

  return { linked: true, userId: found.id };
}

async function updatePassword(userId, password) {
  const { error } = await supabase.auth.admin.updateUserById(userId, { password });
  if (error) throw error;
}

async function updateEmail(userId, email) {
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    email: String(email).trim().toLowerCase(),
    email_confirm: true
  });
  if (error) throw error;
}

// Desactiva la cuenta en vez de borrarla. Si se borrara, se perdería el
// historial de turnos vinculados a ese id de cuenta, y además dejaría al
// panel de Supabase lleno de usuarios sin fila asociada.
async function disableLogin(employeeId) {
  const found = await findLoginByEmployee(employeeId);
  if (!found) return { disabled: false, reason: 'sin_login' };

  const { error } = await supabase.auth.admin.updateUserById(found.id, {
    ban_duration: '876000h', // ~100 años
    app_metadata: { role: 'employee', employee_id: employeeId, disabled: true }
  });

  if (error) throw error;
  return { disabled: true };
}

async function deleteLogin(employeeId) {
  const found = await findLoginByEmployee(employeeId);
  if (!found) return { deleted: false, reason: 'sin_login' };

  const { error } = await supabase.auth.admin.deleteUser(found.id);
  if (error) throw error;
  return { deleted: true };
}

// Lista de ids de profesional que tienen cuenta habilitada. Se usa para marcar
// en el panel cuáles ya pueden entrar, sin tener que preguntar una por una.
async function loginStatusFor(employeeIds) {
  let users = [];
  try {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return {};
    users = data?.users || [];
  } catch {
    // Si no se puede leer la lista, el panel igual funciona: se muestra todo
    // como "sin cuenta" y el admin puede probarlo entrando con el password.
    return {};
  }

  const porEmpleado = new Map();
  for (const u of users) {
    const eid = u.app_metadata?.employee_id;
    if (eid) porEmpleado.set(eid, u);
  }

  return Object.fromEntries(
    employeeIds.map((id) => {
      const u = porEmpleado.get(id);
      if (!u) return [id, { tieneLogin: false }];
      return [id, { tieneLogin: true, email: u.email, deshabilitada: isBanned(u) }];
    })
  );
}

function isBanned(user) {
  if (user?.ban_duration && user.ban_duration !== 'none') return true;
  if (user?.banned_until && new Date(user.banned_until).getTime() > Date.now()) return true;
  return false;
}

module.exports = {
  mensajeDeError,
  employeeIdFromUser,
  findLoginByEmployee,
  createLogin,
  linkLogin,
  updatePassword,
  updateEmail,
  disableLogin,
  deleteLogin,
  loginStatusFor,
  isBanned
};
