-- Release programable: habilita la app de a partes.
-- Pegar en el SQL Editor de Supabase. Idempotente.

-- Configuración global. Hoy sólo el stage actual; queda como tabla para que
-- más adelante entren otras cosas (por ejemplo, la fecha del próximo cobro).
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Una fila por funcionalidad. `stage` es en qué etapa aparece y `enabled` es el
-- toggle individual para exceptuar algo sin bajar la etapa entera.
CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Los servicios escriben con la service key, que ya salta RLS. Estas políticas
-- quedan por si algún día se lee desde el cliente.
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Postgres no tiene CREATE POLICY IF NOT EXISTS, así que se borra la anterior
-- antes de crearla y el bloque se puede correr las veces que haga falta.
DROP POLICY IF EXISTS "Service role full access" ON app_settings;
CREATE POLICY "Service role full access" ON app_settings
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access" ON feature_flags;
CREATE POLICY "Service role full access" ON feature_flags
  FOR ALL USING (auth.role() = 'service_role');

-- Etapa 0: la base. Reservas, servicios y seña obligatoria.
INSERT INTO app_settings (key, value) VALUES ('current_stage', '0')
ON CONFLICT (key) DO NOTHING;

-- Las banderas se crean todas prendidas: lo que las apaga es el stage, no el
-- flag. Así, subir la etapa enciende un lote completo de una sola vez.
INSERT INTO feature_flags (key, enabled) VALUES
  ('core', true),
  ('cash', true),
  ('employee_panel', true),
  ('professional_assignment', true),
  ('gift_cards', true),
  ('commissions', true),
  ('reports', true),
  ('client_fidelity', true),
  ('memberships', true),
  ('whatsapp_auto', true),
  ('whatsapp_reminders', true)
ON CONFLICT (key) DO NOTHING;
