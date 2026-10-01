/**
 * Google Calendar integration para profesionales con Gmail personal.
 *
 * Requiere en variables de entorno:
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET
 * - GOOGLE_REDIRECT_URI (ej: https://tu-dominio.com/api/employee/auth/google/callback)
 *
 * Flujo:
 * 1. Profesional hace click en "Conectar Google Calendar" en su panel
 *    -> GET /api/employee/auth/google -> redirige a Google OAuth
 * 2. Google redirige a /api/employee/auth/google/callback?code=...
 *    -> intercambia code por access_token + refresh_token
 *    -> guarda refresh_token en employees.google_refresh_token
 * 3. Al confirmar reserva (payment.js confirm), si la profesional tiene
 *    refresh_token -> crea evento en su calendario.
 *
 * MODO TESTING: en Google Cloud Console, OAuth consent screen -> "Testing"
 * permite hasta 100 usuarios sin verificación. Solo hay que agregar los
 * emails de las profesionales en "Test users".
 */

const { google } = require('googleapis');
const supabase = require('./supabase');

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return { ok: false, error: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REDIRECT_URI requeridas en .env' };
  }

  return { ok: true, client: new google.auth.OAuth2(clientId, clientSecret, redirectUri) };
}

/**
 * Genera la URL de autorización para que la profesional conecte su cuenta.
 * @param {string} employeeId - ID de la profesional (state para validar callback)
 * @returns {string|Object} URL de autorización o {ok:false, error}
 */
function getAuthUrl(employeeId) {
  const oauth = getOAuth2Client();
  if (!oauth.ok) return oauth;

  const state = Buffer.from(JSON.stringify({ employeeId, ts: Date.now() })).toString('base64url');

  return oauth.client.generateAuthUrl({
    access_type: 'offline',        // necesario para recibir refresh_token
    prompt: 'consent',             // fuerza consentimiento para obtener refresh_token siempre
    scope: SCOPES,
    state,
    include_granted_scopes: true
  });
}

/**
 * Intercambia el code del callback por tokens y guarda el refresh_token.
 * @param {string} code - código de autorización
 * @param {string} state - state devuelto por Google (contiene employeeId)
 * @returns {Object} {ok: true, employeeId} o {ok: false, error}
 */
async function handleCallback(code, state) {
  const oauth = getOAuth2Client();
  if (!oauth.ok) return oauth;

  let employeeId;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    employeeId = decoded.employeeId;
  } catch (e) {
    return { ok: false, error: 'State inválido' };
  }

  if (!employeeId) {
    return { ok: false, error: 'employeeId faltante en state' };
  }

  try {
    const { tokens } = await oauth.client.getToken(code);

    if (!tokens.refresh_token) {
      return { ok: false, error: 'No se recibió refresh_token. Forzá prompt=consent.' };
    }

    // Guardar refresh_token en la base (en prod debería ir encriptado)
    const { error } = await supabase
      .from('employees')
      .update({
        google_refresh_token: tokens.refresh_token,
        google_token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
      })
      .eq('id', employeeId);

    if (error) throw error;

    return { ok: true, employeeId };
  } catch (err) {
    console.error('Error en handleCallback:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Obtiene un cliente autenticado para una profesional (refresca access token si hace falta).
 * @param {string} employeeId
 * @returns {Object} {ok: true, client: google.auth.OAuth2} o {ok: false, error}
 */
async function getAuthenticatedClient(employeeId) {
  const oauth = getOAuth2Client();
  if (!oauth.ok) return oauth;

  const { data: employee, error } = await supabase
    .from('employees')
    .select('google_refresh_token, google_token_expiry, google_calendar_id')
    .eq('id', employeeId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!employee || !employee.google_refresh_token) {
    return { ok: false, error: 'Profesional no tiene Google Calendar conectado' };
  }

  oauth.client.setCredentials({ refresh_token: employee.google_refresh_token });

  // Si el access token expira pronto, googleapis lo refresca automáticamente
  // al hacer la primera llamada. No hace falta refrescar manualmente aquí.

  return { ok: true, client: oauth.client, calendarId: employee.google_calendar_id || 'primary' };
}

/**
 * Crea un evento en el calendario de la profesional.
 * @param {Object} params
 *   employeeId: string
 *   summary: string (título del evento)
 *   description: string
 *   start: Date o ISO string
 *   end: Date o ISO string
 *   location?: string
 * @returns {Object} {ok: true, eventId} o {ok: false, error}
 */
async function createEvent({ employeeId, summary, description, start, end, location }) {
  const auth = await getAuthenticatedClient(employeeId);
  if (!auth.ok) return auth;

  const calendar = google.calendar({ version: 'v3', auth: auth.client });

  try {
    const res = await calendar.events.insert({
      calendarId: auth.calendarId,
      requestBody: {
        summary,
        description,
        location,
        start: { dateTime: new Date(start).toISOString(), timeZone: 'America/Argentina/Buenos_Aires' },
        end: { dateTime: new Date(end).toISOString(), timeZone: 'America/Argentina/Buenos_Aires' },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 30 },
            { method: 'popup', minutes: 1440 } // 1 día antes
          ]
        }
      }
    });

    return { ok: true, eventId: res.data.id, htmlLink: res.data.htmlLink };
  } catch (err) {
    // Si el refresh_token expiró (revocado por usuario), limpiarlo
    if (err.code === 401 || (err.response?.data?.error?.message?.includes('invalid_grant'))) {
      await supabase.from('employees').update({ google_refresh_token: null, google_token_expiry: null }).eq('id', employeeId);
      return { ok: false, error: 'Token revocado o expirado. La profesional debe reconectar su cuenta.', needsReconnect: true };
    }
    console.error('Error creando evento en Google Calendar:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Elimina un evento del calendario (para cuando se cancela/rechaza una reserva).
 * @param {string} employeeId
 * @param {string} eventId
 * @returns {Object} {ok: true} o {ok: false, error}
 */
async function deleteEvent(employeeId, eventId) {
  const auth = await getAuthenticatedClient(employeeId);
  if (!auth.ok) return auth;

  const calendar = google.calendar({ version: 'v3', auth: auth.client });

  try {
    await calendar.events.delete({ calendarId: auth.calendarId, eventId });
    return { ok: true };
  } catch (err) {
    if (err.code === 404) return { ok: true }; // ya no existe
    if (err.code === 401 || (err.response?.data?.error?.message?.includes('invalid_grant'))) {
      await supabase.from('employees').update({ google_refresh_token: null, google_token_expiry: null }).eq('id', employeeId);
      return { ok: false, error: 'Token revocado', needsReconnect: true };
    }
    console.error('Error borrando evento de Google Calendar:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Verifica si una profesional tiene Google Calendar conectado y funcional.
 * @param {string} employeeId
 * @returns {Object} {ok: true, connected: true/false, error?}
 */
async function checkConnection(employeeId) {
  const { data: employee, error } = await supabase
    .from('employees')
    .select('google_refresh_token, google_token_expiry')
    .eq('id', employeeId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!employee || !employee.google_refresh_token) {
    return { ok: true, connected: false };
  }

  // Test rápido: intenta refrescar el token
  const oauth = getOAuth2Client();
  if (!oauth.ok) return { ok: false, connected: false, error: oauth.error };

  oauth.client.setCredentials({ refresh_token: employee.google_refresh_token });
  try {
    await oauth.client.getAccessToken();
    return { ok: true, connected: true };
  } catch (e) {
    return { ok: true, connected: false, error: 'Token expirado o revocado' };
  }
}

module.exports = {
  getAuthUrl,
  handleCallback,
  createEvent,
  deleteEvent,
  checkConnection
};