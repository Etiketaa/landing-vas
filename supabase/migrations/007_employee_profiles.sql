-- Fase 4: Perfil profesional (foto, bio, galería, servicios).
-- Cada profesional carga su perfil desde su micrositio; el landing lo muestra.

CREATE TABLE IF NOT EXISTS employee_profiles (
  employee_id UUID PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  photo_url TEXT,
  bio TEXT,
  gallery JSONB DEFAULT '[]'::jsonb,  -- [{url, caption}]
  services JSONB DEFAULT '[]'::jsonb, -- [{name, duration_minutes, description}]
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE employee_profiles ENABLE ROW LEVEL SECURITY;

-- El servicio de backend (service_role) tiene acceso total.
CREATE POLICY "Service role full access" ON employee_profiles
  FOR ALL USING (auth.role() = 'service_role');

-- Lectura pública para el landing (solo perfiles de profesionales activas).
CREATE POLICY "Public read profiles" ON employee_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = employee_profiles.employee_id
        AND e.active = true
    )
  );
