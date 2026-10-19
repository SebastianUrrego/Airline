-- Esquema transaccional (OLTP) del sistema de reservas.
-- Se ejecuta al iniciar la API; todas las sentencias son idempotentes.

CREATE TABLE IF NOT EXISTS airports (
    code  CHAR(3) PRIMARY KEY,           -- codigo IATA, p. ej. BOG
    city  VARCHAR(80)
);

CREATE TABLE IF NOT EXISTS routes (
    route_code   VARCHAR(7) PRIMARY KEY, -- 'BOG-MDE'
    origin       CHAR(3) NOT NULL REFERENCES airports(code),
    destination  CHAR(3) NOT NULL REFERENCES airports(code),
    CHECK (origin <> destination)
);

CREATE TABLE IF NOT EXISTS aircraft (
    aircraft_id  VARCHAR(10) PRIMARY KEY, -- matricula, p. ej. HK-5021
    model        VARCHAR(40) NOT NULL,
    capacity     INT         NOT NULL CHECK (capacity > 0)
);

-- Vuelo programado: el que se repite (AV123 BOG-MDE todos los dias a las 06:00).
CREATE TABLE IF NOT EXISTS scheduled_flights (
    flight_number   VARCHAR(8)  PRIMARY KEY,
    route_code      VARCHAR(7)  NOT NULL REFERENCES routes(route_code),
    departure_time  TIME        NOT NULL,
    days_of_week    VARCHAR(7)  NOT NULL DEFAULT '1234567',  -- 1 = lunes ... 7 = domingo
    aircraft_id     VARCHAR(10) REFERENCES aircraft(aircraft_id)  -- avion asignado por defecto
);

-- Instancia de vuelo en una fecha concreta. seats_available es el inventario de sillas:
-- es la unica fila que se bloquea al reservar. flight_number y aircraft_id son opcionales
-- para vuelos creados directamente desde /admin/flights (charter o pruebas).
CREATE TABLE IF NOT EXISTS flights (
    flight_id        VARCHAR(32) PRIMARY KEY,
    flight_number    VARCHAR(8)  REFERENCES scheduled_flights(flight_number),
    route_code       VARCHAR(7)  NOT NULL REFERENCES routes(route_code),
    aircraft_id      VARCHAR(10) REFERENCES aircraft(aircraft_id),
    flight_date      DATE        NOT NULL,
    capacity         INT         NOT NULL CHECK (capacity > 0),
    seats_available  INT         NOT NULL,
    price_cents      BIGINT      NOT NULL CHECK (price_cents > 0),  -- tarifa base
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (seats_available BETWEEN 0 AND capacity),
    UNIQUE (flight_number, flight_date)
);

CREATE INDEX IF NOT EXISTS idx_flights_route_date ON flights (route_code, flight_date);

CREATE TABLE IF NOT EXISTS passengers (
    passenger_id  BIGSERIAL    PRIMARY KEY,
    full_name     VARCHAR(120) NOT NULL,
    document_id   VARCHAR(20),
    email         VARCHAR(120)
);

-- Reglas de tarifa: el precio depende de la clase y de la anticipacion de la compra.
-- Se aplica la regla de la clase con el mayor min_days_before que no supere los dias que faltan.
CREATE TABLE IF NOT EXISTS fare_rules (
    fare_rule_id     SMALLINT     PRIMARY KEY,
    fare_class       VARCHAR(10)  NOT NULL CHECK (fare_class IN ('ECONOMY', 'BUSINESS')),
    min_days_before  INT          NOT NULL CHECK (min_days_before >= 0),
    multiplier       NUMERIC(4,2) NOT NULL CHECK (multiplier > 0),
    UNIQUE (fare_class, min_days_before)
);

INSERT INTO fare_rules (fare_rule_id, fare_class, min_days_before, multiplier) VALUES
    (1, 'ECONOMY',   0, 1.30), (2, 'ECONOMY',   7, 1.10), (3, 'ECONOMY',  21, 1.00),
    (4, 'BUSINESS',  0, 2.60), (5, 'BUSINESS',  7, 2.20), (6, 'BUSINESS', 21, 2.00)
ON CONFLICT DO NOTHING;

-- Reserva = itinerario completo de un pasajero, que puede tener varios tramos (escalas).
CREATE TABLE IF NOT EXISTS reservations (
    reservation_id     VARCHAR(40) PRIMARY KEY,
    passenger_id       BIGINT      NOT NULL REFERENCES passengers(passenger_id),
    fare_rule_id       SMALLINT    NOT NULL REFERENCES fare_rules(fare_rule_id),
    status             VARCHAR(10) NOT NULL CHECK (status IN ('CONFIRMED', 'CANCELLED')),
    total_price_cents  BIGINT      NOT NULL CHECK (total_price_cents > 0),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tramo de una reserva: cada uno ocupa una silla en un vuelo.
CREATE TABLE IF NOT EXISTS reservation_segments (
    reservation_id  VARCHAR(40) NOT NULL REFERENCES reservations(reservation_id),
    segment_no      SMALLINT    NOT NULL CHECK (segment_no >= 1),
    flight_id       VARCHAR(32) NOT NULL REFERENCES flights(flight_id),
    price_cents     BIGINT      NOT NULL CHECK (price_cents > 0),
    PRIMARY KEY (reservation_id, segment_no),
    UNIQUE (reservation_id, flight_id)
);

CREATE INDEX IF NOT EXISTS idx_segments_flight ON reservation_segments (flight_id);

-- El cobro se delega a una pasarela externa; aqui solo queda su referencia y estado.
CREATE TABLE IF NOT EXISTS payments (
    payment_id      BIGSERIAL   PRIMARY KEY,
    reservation_id  VARCHAR(40) NOT NULL UNIQUE REFERENCES reservations(reservation_id),
    amount_cents    BIGINT      NOT NULL CHECK (amount_cents > 0),
    provider        VARCHAR(30) NOT NULL,
    provider_ref    VARCHAR(64) NOT NULL,
    status          VARCHAR(10) NOT NULL CHECK (status IN ('APPROVED', 'REFUNDED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
