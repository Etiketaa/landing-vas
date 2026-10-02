-- Fase 4b: Toggles bancarios por profesional.
-- El admin decide si cada profesional recibe por cuenta propia o va a cuenta común.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS recibe_por_cuenta_propia BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS puede_ver_datos_bancarios BOOLEAN DEFAULT false;

COMMENT ON COLUMN employees.recibe_por_cuenta_propia IS 'Si true, el dinero de la seña va a la cuenta de la profesional. Si false, va a la cuenta del centro.';
COMMENT ON COLUMN employees.puede_ver_datos_bancarios IS 'Si true, la profesional puede ver los datos bancarios de otras (para asignación automática).';
