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

-- NOTA sobre '2do servicio': el motor soporta min_services, pero bookings tiene
-- un solo service_id por turno, asi que la reserva publica siempre llega con
-- 1 servicio y esta regla no se va a cumplir. Queda para cuando exista la
-- reserva multi-servicio.

-- Horarios de atención: 0 = domingo ... 6 = sábado.
-- La agenda usa esta tabla para generar los horarios disponibles. Sin filas
-- el sistema cae a una ventana por defecto de 10:00 a 20:00.
INSERT INTO business_hours (day_of_week, open_time, close_time, active) VALUES
(0, '10:00', '14:00', true),
(1, '09:00', '19:00', true),
(2, '09:00', '19:00', true),
(3, '09:00', '19:00', true),
(4, '09:00', '19:00', true),
(5, '09:00', '19:00', true),
(6, '09:00', '17:00', true);
