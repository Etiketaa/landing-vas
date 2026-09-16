CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  base_price DECIMAL(10,2) NOT NULL,
  duration_minutes INT NOT NULL,
  category TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  client_contact TEXT NOT NULL,
  service_id UUID REFERENCES services(id),
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  final_price DECIMAL(10,2) NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  reminder_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  conditions JSONB NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  priority INT DEFAULT 0,
  active BOOLEAN DEFAULT true,
  valid_from DATE,
  valid_until DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bookings_date ON bookings(booking_date);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_pricing_rules_type ON pricing_rules(rule_type);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON bookings
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Public read services" ON services
  FOR SELECT USING (true);

CREATE POLICY "Public read pricing rules" ON pricing_rules
  FOR SELECT USING (active = true);

CREATE TABLE marketing_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  source TEXT DEFAULT 'popup',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE marketing_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON marketing_leads
  FOR ALL USING (auth.role() = 'service_role');
