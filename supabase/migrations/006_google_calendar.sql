-- Fase 3: Google Calendar OAuth por profesional.
-- Cada profesional conecta su Gmail personal; guardamos refresh_token y calendar_id.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS google_refresh_token text,
  ADD COLUMN IF NOT EXISTS google_calendar_id text DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS google_token_expiry timestamptz;

COMMENT ON COLUMN employees.google_refresh_token IS 'Refresh token de OAuth2 para Google Calendar (encriptado en prod)';
COMMENT ON COLUMN employees.google_calendar_id IS 'ID del calendario a usar (default "primary")';
COMMENT ON COLUMN employees.google_token_expiry IS 'Expiración del access token actual';
