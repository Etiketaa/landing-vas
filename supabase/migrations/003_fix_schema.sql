-- Fase 1: alinear el esquema con lo que el codigo ya usa.
-- Pegar en el SQL Editor de Supabase. Es idempotente: se puede correr mas de
-- una vez sin romper nada.
--
-- El resto de los arreglos de esta fase NO requieren DDL y ya estan en el
-- codigo: el cliente Supabase aislado, la subida de comprobantes a Storage, la
-- verificacion del contacto, el veto a confirmar sin seña y el barrido de
-- reservas vencidas.

-- 1) employees: el portal de profesionales (api/employee/auth.js) busca por
--    email y compara password_hash. Las columnas nunca se crearon, asi que la
--    consulta fallaba con "column employees.email does not exist" y el codigo
--    lo traducía a "Credenciales invalidas": ningun profesional podia entrar.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash text;

-- Un mismo email no puede repetirse entre profesionales.
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_email
  ON employees (email) WHERE email IS NOT NULL;

-- 2) marketing_leads: el popup de la landing POSTea aca. La tabla no existia,
--    asi que cada envio fallaba en silencio y no se guardo ni un lead desde que
--    la web salio en linea.
CREATE TABLE IF NOT EXISTS marketing_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  source TEXT DEFAULT 'popup',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE marketing_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON marketing_leads
  FOR ALL USING (auth.role() = 'service_role');

-- 3) Comision por profesional y por servicio. Guarda el porcentaje que se lleva
--    la profesional sobre el precio del turno; el centro se queda el complemento.
--    Es una columna y no un valor en services porque cada profesional cobra
--    distinto segun el servicio, y esos porcentajes todavia no estan acordados.
--    services.commission_percent queda como el porcentaje del centro.
ALTER TABLE employee_services
  ADD COLUMN IF NOT EXISTS commission_percent numeric NOT NULL DEFAULT 0;

-- 4) Indice para el barrido de reservas con la seña vencida. Sin esto, cada
--    consulta de agenda recorre la tabla completa de bookings.
CREATE INDEX IF NOT EXISTS idx_bookings_pending_deadline
  ON bookings (status, deposit_deadline)
  WHERE status = 'pending_payment';
