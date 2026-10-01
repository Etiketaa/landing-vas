-- Fase 2: datos bancarios de la profesional (para la seña por transferencia).
-- Idempotente: se puede correr varias veces.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS titular text,
  ADD COLUMN IF NOT EXISTS bank_name text;

-- Comentario para que quede claro en el esquema.
COMMENT ON COLUMN employees.titular IS 'Nombre del titular de la cuenta bancaria (para mostrar en la seña)';
COMMENT ON COLUMN employees.bank_name IS 'Nombre del banco (opcional, para mostrar en la seña)';
