
-- Profiles (vinculado a auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'employee' CHECK (role IN ('admin','employee')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Employees
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  role TEXT DEFAULT 'employee',
  phone TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE employee_services (
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  service_id UUID REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (employee_id, service_id)
);

-- Business hours
CREATE TABLE business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  active BOOLEAN DEFAULT true
);

CREATE TABLE schedule_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_date DATE NOT NULL,
  is_closed BOOLEAN DEFAULT false,
  custom_open TIME,
  custom_close TIME,
  reason TEXT
);

-- Cash register
CREATE TABLE cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_by UUID REFERENCES profiles(id),
  closed_by UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  opening_float DECIMAL(10,2) NOT NULL DEFAULT 0,
  counted_close DECIMAL(10,2),
  expected_close DECIMAL(10,2),
  variance DECIMAL(10,2),
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES cash_sessions(id),
  type TEXT NOT NULL CHECK (type IN ('CASH_IN','CASH_OUT')),
  source TEXT NOT NULL,
  booking_id UUID REFERENCES bookings(id),
  amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash','card','transfer','qr')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bookings: add columns
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT false;

-- Indexes
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_employees_active ON employees(active);
CREATE INDEX idx_business_hours_day ON business_hours(day_of_week);
CREATE INDEX idx_cash_sessions_status ON cash_sessions(status);
CREATE INDEX idx_cash_movements_session ON cash_movements(session_id);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON profiles FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON employees FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON employee_services FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON business_hours FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON schedule_exceptions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON cash_sessions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON cash_movements FOR ALL USING (auth.role() = 'service_role');

-- Public read business hours
CREATE POLICY "Public read business hours" ON business_hours FOR SELECT USING (true);
