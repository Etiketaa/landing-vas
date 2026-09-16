-- ============================================
-- VAS Centro de Estética - Migraciones DB
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- Servicios: seña y comisión
ALTER TABLE services ADD COLUMN IF NOT EXISTS deposit_percent numeric DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS commission_percent numeric DEFAULT 0;

-- Empleados: datos bancarios para cobrar seña
ALTER TABLE employees ADD COLUMN IF NOT EXISTS cbu text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS alias text;

-- Reservas: sistema de seña y comprobante
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_amount numeric DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_deadline timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_proof text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_uploaded_at timestamptz;

-- Tabla de clientes (base de datos de quienes van a la estética)
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Tabla de sesiones de empleados (login por profesional)
CREATE TABLE IF NOT EXISTS employee_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Tabla de gift cards
CREATE TABLE IF NOT EXISTS gift_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  amount numeric NOT NULL,
  balance numeric NOT NULL,
  buyer_name text,
  buyer_contact text,
  recipient_name text,
  recipient_contact text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  used_at timestamptz
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_employee ON bookings(employee_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_gift_cards_code ON gift_cards(code);
CREATE INDEX IF NOT EXISTS idx_employee_sessions_token ON employee_sessions(token);
