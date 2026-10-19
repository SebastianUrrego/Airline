-- Datos de ejemplo para la base OLTP, enero a junio de 2026:
--   8 rutas con un vuelo programado diario (~1.450 vuelos de 150 sillas) operados por 4 aviones,
--   entre 55 % y 95 % de ocupacion directa por vuelo (~160.000 reservas de un tramo),
--   5 itinerarios diarios con escala MDE-BOG + BOG-SMR, 10 % de cancelaciones y 12 % BUSINESS.
-- La tarifa de cada reserva sale de fare_rules segun la clase y los dias de anticipacion.
-- Los vuelos de ejemplo empiezan por 'S'.
BEGIN;

SELECT setseed(0.42);

INSERT INTO airports (code, city) VALUES
    ('BOG', 'Bogota'), ('MDE', 'Medellin'), ('CLO', 'Cali'), ('CTG', 'Cartagena'),
    ('BAQ', 'Barranquilla'), ('SMR', 'Santa Marta'), ('BGA', 'Bucaramanga'), ('PEI', 'Pereira')
ON CONFLICT (code) DO UPDATE SET city = EXCLUDED.city;

INSERT INTO aircraft (aircraft_id, model, capacity) VALUES
    ('HK-5021', 'Airbus A320', 150), ('HK-5022', 'Airbus A320', 150),
    ('HK-5023', 'Airbus A320', 150), ('HK-5024', 'Airbus A320', 150)
ON CONFLICT DO NOTHING;

INSERT INTO routes (route_code, origin, destination) VALUES
    ('BOG-MDE', 'BOG', 'MDE'), ('MDE-BOG', 'MDE', 'BOG'), ('BOG-CTG', 'BOG', 'CTG'),
    ('BOG-CLO', 'BOG', 'CLO'), ('BOG-BAQ', 'BOG', 'BAQ'), ('MDE-CTG', 'MDE', 'CTG'),
    ('BOG-SMR', 'BOG', 'SMR'), ('CLO-CTG', 'CLO', 'CTG')
ON CONFLICT DO NOTHING;

INSERT INTO scheduled_flights (flight_number, route_code, departure_time, aircraft_id) VALUES
    ('AV101', 'BOG-MDE', '06:00', 'HK-5021'), ('AV102', 'MDE-BOG', '08:30', 'HK-5021'),
    ('AV201', 'BOG-CTG', '07:15', 'HK-5022'), ('AV301', 'BOG-CLO', '09:00', 'HK-5023'),
    ('AV401', 'BOG-BAQ', '11:30', 'HK-5024'), ('AV501', 'MDE-CTG', '13:00', 'HK-5022'),
    ('AV601', 'BOG-SMR', '12:00', 'HK-5021'), ('AV701', 'CLO-CTG', '15:45', 'HK-5023')
ON CONFLICT DO NOTHING;

-- Una instancia por vuelo programado y por dia.
INSERT INTO flights (flight_id, flight_number, route_code, aircraft_id, flight_date, capacity, seats_available, price_cents)
SELECT 'S' || s.flight_number || to_char(d, 'YYYYMMDD'), s.flight_number, s.route_code, s.aircraft_id,
       d::date, a.capacity, a.capacity,
       (18000000 + floor(random() * 22000000))::bigint   -- centavos: entre 180.000 y 400.000 COP
FROM scheduled_flights s
JOIN aircraft a USING (aircraft_id)
CROSS JOIN generate_series(date '2026-01-01', date '2026-06-30', interval '1 day') AS d
ON CONFLICT DO NOTHING;

-- Itinerarios generados: uno por reserva; un tramo para las directas y dos para las de escala.
CREATE TEMP TABLE seed_itineraries AS
SELECT f.flight_id || '-' || lpad(n::text, 3, '0') AS reservation_id,
       ARRAY[f.flight_id] AS legs, f.flight_date, n
FROM flights f
CROSS JOIN LATERAL generate_series(1, (f.capacity * (0.55 + random() * 0.40))::int) AS n
WHERE f.flight_id LIKE 'S%';

INSERT INTO seed_itineraries
SELECT a.flight_id || '-X' || n, ARRAY[a.flight_id, b.flight_id], a.flight_date, 900 + n
FROM flights a
JOIN flights b ON b.flight_date = a.flight_date AND b.flight_number = 'AV601'
CROSS JOIN generate_series(1, 5) AS n
WHERE a.flight_number = 'AV102';

ALTER TABLE seed_itineraries
    ADD COLUMN fare_class VARCHAR(10), ADD COLUMN days_before INT, ADD COLUMN status VARCHAR(10),
    ADD COLUMN passenger_id BIGINT;
UPDATE seed_itineraries SET
    fare_class  = CASE WHEN random() < 0.12 THEN 'BUSINESS' ELSE 'ECONOMY' END,
    days_before = 1 + floor(random() * 60)::int,
    status      = CASE WHEN random() < 0.10 THEN 'CANCELLED' ELSE 'CONFIRMED' END;

-- Un pasajero por reserva (los datos de ejemplo no repiten personas).
WITH ins AS (
    INSERT INTO passengers (full_name)
    SELECT 'Pasajero ' || reservation_id FROM seed_itineraries
    RETURNING passenger_id, full_name
)
UPDATE seed_itineraries i SET passenger_id = ins.passenger_id
FROM ins WHERE ins.full_name = 'Pasajero ' || i.reservation_id;

-- Tramos con su precio: tarifa base del vuelo x multiplicador de la regla aplicada.
CREATE TEMP TABLE seed_segments AS
SELECT i.reservation_id, leg.segment_no::smallint AS segment_no, leg.flight_id,
       round(f.price_cents * fr.multiplier)::bigint AS price_cents, fr.fare_rule_id
FROM seed_itineraries i
CROSS JOIN LATERAL unnest(i.legs) WITH ORDINALITY AS leg(flight_id, segment_no)
JOIN flights f ON f.flight_id = leg.flight_id
JOIN LATERAL (
    SELECT fare_rule_id, multiplier FROM fare_rules
    WHERE fare_class = i.fare_class AND min_days_before <= i.days_before
    ORDER BY min_days_before DESC LIMIT 1
) fr ON true;

INSERT INTO reservations (reservation_id, passenger_id, fare_rule_id, status, total_price_cents, created_at, updated_at)
SELECT i.reservation_id, i.passenger_id, min(s.fare_rule_id), i.status, sum(s.price_cents),
       i.flight_date - i.days_before, i.flight_date - i.days_before
FROM seed_itineraries i JOIN seed_segments s USING (reservation_id)
GROUP BY i.reservation_id, i.passenger_id, i.status, i.flight_date, i.days_before
ON CONFLICT DO NOTHING;

INSERT INTO reservation_segments (reservation_id, segment_no, flight_id, price_cents)
SELECT reservation_id, segment_no, flight_id, price_cents FROM seed_segments
ON CONFLICT DO NOTHING;

INSERT INTO payments (reservation_id, amount_cents, provider, provider_ref, status, created_at)
SELECT reservation_id, total_price_cents, 'SIMULADO', 'SIM-' || md5(reservation_id),
       CASE WHEN status = 'CANCELLED' THEN 'REFUNDED' ELSE 'APPROVED' END, created_at
FROM reservations
WHERE reservation_id IN (SELECT reservation_id FROM seed_itineraries)
ON CONFLICT DO NOTHING;

-- El inventario debe coincidir con los tramos de reservas confirmadas.
UPDATE flights f
SET seats_available = f.capacity - c.sold
FROM (SELECT s.flight_id, count(*) AS sold
      FROM reservation_segments s JOIN reservations r USING (reservation_id)
      WHERE r.status = 'CONFIRMED' GROUP BY s.flight_id) c
WHERE f.flight_id = c.flight_id AND f.flight_id LIKE 'S%';

COMMIT;
