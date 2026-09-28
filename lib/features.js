const supabase = require('./supabase');

// Release programable: habilita la app de a partes.
//
// La idea es no entregar todo de una. Hay un unico numero, `current_stage`, y
// cada funcionalidad declara en que etapa aparece. Subir el numero enciende un
// lote completo de una, de forma atomica; el toggle individual permite
// Exceptuar algo puntual sin bajar la etapa entera.
//
// Esto reemplaza la alternativa de mantener una rama por etapa: con el flag en
// la base, el mismo build sirve para las cuatro etapas y no hay nada que
// mergear cuando se cobra una parte nueva.

const STAGES = [
  { stage: 0, label: 'Base', description: 'Landing, agenda, servicios y seña obligatoria. Lo mínimo para empezar a atender.' },
  { stage: 1, label: 'Operación diaria', description: 'Caja, portal de profesionales, gift cards y elegir profesional al reservar.' },
  { stage: 2, label: 'Comisiones', description: 'Planilla de comisiones por profesional y reportes de facturación.' },
  { stage: 3, label: 'Fidelización', description: 'Frecuencia de clientas, historial de visitas y membresías.' },
  { stage: 4, label: 'Comunicación', description: 'Avisos y recordatorios automáticos por WhatsApp.' }
];

// `core` no se puede apagar: sin reservas no hay nada.
// El resto arranca con la etapa que le corresponde.
const FEATURES = [
  { key: 'core', stage: 0, label: 'Reservas y seña', description: 'Landing, agenda, servicios y comprobante de seña. Base del sistema.', locked: true },

  { key: 'cash', stage: 1, label: 'Caja diaria', description: 'Apertura, movimientos de ingreso y egreso, y cierre con arqueo.' },
  { key: 'employee_panel', stage: 1, label: 'Portal de profesionales', description: 'Cada profesional entra con su usuario y ve únicamente sus turnos.' },
  { key: 'professional_assignment', stage: 1, label: 'Elegir profesional', description: 'La clienta elige con quién quiere hacer el turno, en vez de que se asigne la primera disponible.' },
  { key: 'gift_cards', stage: 1, label: 'Gift cards', description: 'Venta, canje y saldo de tarjetas de regalo.' },

  { key: 'commissions', stage: 2, label: 'Comisiones', description: 'Planilla de cuánto le corresponde a cada profesional por turno.' },
  { key: 'reports', stage: 2, label: 'Reportes', description: 'Facturación por período y servicio.' },

  { key: 'client_fidelity', stage: 3, label: 'Fidelización', description: 'Visitas acumuladas por clienta para premiar la recurrencia.' },
  { key: 'memberships', stage: 3, label: 'Membresías', description: 'Cuota mensual con descuentos y prioridad para sacar turno.' },

  { key: 'whatsapp_auto', stage: 4, label: 'Avisos por WhatsApp', description: 'Confirmación y recordatorios automáticos desde el número del centro.' },
  { key: 'whatsapp_reminders', stage: 4, label: 'Recordatorios automáticos', description: 'Aviso del día anterior a cada turno confirmado.' }
];

const FEATURE_INDEX = new Map(FEATURES.map((f) => [f.key, f]));

const CACHE_TTL_MS = 30 * 1000;
let cache = { at: 0, state: null };
let warnedDegraded = false;

// Ante un fallo de infraestructura se asume la etapa más alta (todo prendido).
// Es la decision menos mala de las dos: si el sistema de flags se cae, lo que
// no puede pasar es que la clienta no pueda reservar. Mostrar de más una
// funcionalidad se corrige en un minuto; perder una venta, no. El estado
// degradado queda visible en /api/admin/features para que no pase inadvertido.
function degradedState() {
  if (!warnedDegraded) {
    warnedDegraded = true;
    console.warn(
      '[features] no se pudo leer el estado de releases, se asumen todas las ' +
      'funcionalidades activas. Revisá las tablas feature_flags y app_settings.'
    );
  }

  return {
    stage: STAGES[STAGES.length - 1].stage,
    degraded: true,
    features: FEATURES.map((f) => ({ ...f, enabled: true, active: true }))
  };
}

function buildState(stage, rows) {
  const overrides = new Map((rows || []).map((r) => [r.key, r]));

  const features = FEATURES.map((f) => {
    const row = overrides.get(f.key);
    // Un flag bloqueado ignora el toggle: siempre activo.
    const enabled = f.locked ? true : row ? row.enabled !== false : true;
    // Activo = habilitado Y ya corresponde la etapa.
    const active = enabled && stage >= f.stage;

    return {
      ...f,
      enabled,
      active,
      updated_at: row?.updated_at || null
    };
  });

  return { stage, degraded: false, features };
}

async function getReleaseState({ force = false } = {}) {
  if (!force && cache.state && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.state;
  }

  try {
    const [{ data: setting, error: settingsError }, { data: rows, error: flagsError }] = await Promise.all([
      supabase.from('app_settings').select('value').eq('key', 'current_stage').maybeSingle(),
      supabase.from('feature_flags').select('key, enabled, updated_at')
    ]);

    if (settingsError) throw settingsError;
    if (flagsError) throw flagsError;

    const stage = setting ? parseInt(setting.value, 10) : 0;
    const state = buildState(Number.isNaN(stage) ? 0 : stage, rows);

    cache = { at: Date.now(), state };
    return state;
  } catch (err) {
    // cache negativo corto, para no pegarle a la base en cada request si la cosa
    // esta caída de verdad.
    if (!cache.state || Date.now() - cache.at < 5000) {
      return cache.state || degradedState();
    }
    cache = { at: Date.now(), state: degradedState() };
    return cache.state;
  }
}

async function isEnabled(key) {
  if (!FEATURE_INDEX.has(key)) {
    // Una clave desconocida no debe romper nada: se considera activa y se avisa.
    console.warn(`[features] isEnabled("${key}") es una clave desconocida`);
    return true;
  }

  const state = await getReleaseState();
  const feature = state.features.find((f) => f.key === key);
  return Boolean(feature?.active);
}

// Middleware para endpoints que no deberian existir todavia.
// 403 y no 404 a proposito: si alguien llega con un link viejo, hay que
// poder explicarle que la funcionalidad todavia no esta habilitada.
function requireFeature(key) {
  return async (req, res, next) => {
    try {
      if (await isEnabled(key)) return next();

      const state = await getReleaseState();
      const feature = state.features.find((f) => f.key === key);

      return res.status(403).json({
        error: `${feature?.label || key} todavia no esta habilitada`,
        feature: key,
        required_stage: feature?.stage,
        current_stage: state.stage
      });
    } catch (err) {
      // Si ni siquiera podemos evaluar el flag, no bloqueamos la operacion.
      return next();
    }
  };
}

async function setStage(stage) {
  const target = parseInt(stage, 10);
  if (Number.isNaN(target) || target < 0 || target > STAGES[STAGES.length - 1].stage) {
    throw new Error(`Etapa inválida. Debe estar entre 0 y ${STAGES[STAGES.length - 1].stage}.`);
  }

  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { key: 'current_stage', value: String(target), updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

  if (error) throw error;
  cache = { at: 0, state: null };

  return getReleaseState({ force: true });
}

async function setFlag(key, enabled) {
  const feature = FEATURE_INDEX.get(key);
  if (!feature) throw new Error(`Funcionalidad desconocida: ${key}`);
  if (feature.locked) throw new Error(`${feature.label} no se puede desactivar`);

  const { error } = await supabase
    .from('feature_flags')
    .upsert(
      { key, enabled: Boolean(enabled), updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

  if (error) throw error;
  cache = { at: 0, state: null };

  return getReleaseState({ force: true });
}

function invalidate() {
  cache = { at: 0, state: null };
}

module.exports = {
  STAGES,
  FEATURES,
  getReleaseState,
  isEnabled,
  requireFeature,
  setStage,
  setFlag,
  invalidate
};
