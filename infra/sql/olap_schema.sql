-- Base analitica (OLAP): tablas agregadas y desnormalizadas que llena el job de Glue.
-- El job las vacia (TRUNCATE) y las vuelve a cargar en cada ejecucion.

CREATE TABLE IF NOT EXISTS fact_route_month (
    route           VARCHAR(7)       NOT NULL,
    month           CHAR(7)          NOT NULL,  -- 'YYYY-MM' (mes de la fecha del vuelo)
    seats_capacity  BIGINT           NOT NULL,
    seats_sold      BIGINT           NOT NULL,  -- reservas CONFIRMED
    occupancy       DOUBLE PRECISION NOT NULL,  -- seats_sold / seats_capacity
    revenue_cents   BIGINT           NOT NULL,  -- solo CONFIRMED
    bookings        BIGINT           NOT NULL,
    cancellations   BIGINT           NOT NULL,
    etl_loaded_at   TIMESTAMPTZ      NOT NULL DEFAULT now(),
    PRIMARY KEY (route, month)
);

CREATE TABLE IF NOT EXISTS fact_fare_month (
    fare_class      VARCHAR(10)      NOT NULL,
    month           CHAR(7)          NOT NULL,
    revenue_cents   BIGINT           NOT NULL,
    bookings        BIGINT           NOT NULL,
    cancellations   BIGINT           NOT NULL,
    cancel_rate     DOUBLE PRECISION NOT NULL,  -- cancelaciones / total de reservas
    etl_loaded_at   TIMESTAMPTZ      NOT NULL DEFAULT now(),
    PRIMARY KEY (fare_class, month)
);
