INSERT INTO services (name, description, base_price, duration_minutes, category) VALUES
('Corte de Cabello', 'Corte profesional masculino/femenino', 3500, 30, 'cabello'),
('Barba', 'Diseño y arreglo de barba', 2500, 20, 'cabello'),
('Tintura', 'Coloración completa', 8000, 90, 'cabello'),
('Manicura', 'Manicura completa con esmalte', 3000, 40, 'uñas'),
('Pedicura', 'Pedicura completa', 3500, 45, 'uñas'),
('Depilación Facial', 'Cera facial', 2500, 20, 'depilación'),
('Masaje Relajante', 'Masaje de 60 minutos', 7000, 60, 'masajes'),
('Limpieza Facial', 'Limpieza profunda + hidratación', 5500, 50, 'facial');

INSERT INTO pricing_rules (name, rule_type, conditions, value, priority) VALUES
('Fin de semana', 'time_multiplier', '{"day_of_week": [0,6]}', 1.20, 10),
('Happy Hour', 'discount', '{"time_range": {"start": "10:00", "end": "12:00"}}', 15, 5),
('2do servicio', 'discount', '{"min_services": 2}', 10, 20),
('Turno último momento', 'discount', '{"hours_until": 2}', 20, 15);
