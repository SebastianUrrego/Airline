# Modelo entidad-relación y diccionario de datos

Diagrama: [diagrama_er.png](diagrama_er.png), en notación **Crow's Foot**. Se genera con
`python docs/diagrama_er.py` y está implementado tal cual en [`backend/schema.sql`](../backend/schema.sql).

## Decisiones del modelo (preguntas guía del 5.3)

| Pregunta | Decisión | Justificación |
|---|---|---|
| ¿Cómo se modela un itinerario con escalas? | La **reserva** es el itinerario completo y tiene uno o más **tramos** (`reservation_segments`). Cada tramo apunta a un vuelo | Una sola transacción reserva todos los tramos: si un tramo no tiene sillas, se deshace todo (todo o nada). Encadenar varias reservas independientes podría dejar al pasajero con media conexión |
| ¿La silla se asigna al comprar o en el check-in? | En el **check-in**, fuera del alcance. Al comprar solo se descuenta un cupo del inventario del vuelo | Asignar sillas concretas al comprar obligaría a bloquear un mapa de sillas por vuelo. Esto complica la concurrencia sin aportar a los requisitos de búsqueda y reserva |
| ¿Cómo se representa un vuelo que se repite cada día? | Se separan dos entidades. **`scheduled_flights`** es el vuelo programado (AV101 BOG-MDE a las 06:00, todos los días). **`flights`** es la instancia en una fecha, con su propio inventario y precio | El inventario y el precio cambian por fecha, el horario no. `flight_number` es opcional en `flights` para permitir vuelos chárter o de prueba creados por `/admin/flights` |
| ¿Dónde vive el control de inventario? | En **`flights.seats_available`**, protegido por `CHECK (seats_available BETWEEN 0 AND capacity)` | Cada reserva hace un `UPDATE ... WHERE seats_available > 0` atómico que bloquea solo esa fila. Así hay un único punto de contención por vuelo y nunca hay sobreventa (RNF de concurrencia) |
| ¿Qué nivel de normalización? | **3FN** en la base OLTP. La base OLAP (`airline_olap`) va **desnormalizada** con agregados por ruta y mes y por tarifa y mes | En OLTP la 3FN evita anomalías de actualización en escrituras concurrentes. El análisis no consulta la OLTP: el ETL de Glue la transforma a tablas planas, sin joins, para las preguntas gerenciales |

**Supuestos declarados:**
- El pago se delega a una pasarela externa. Solo se guarda su referencia, y en este prototipo el cobro es simulado.
- Un pasajero se registra por reserva. No hay programa de viajero frecuente, así que no se deduplican personas.
- No se modelan equipaje ni cambios de fecha. Un cambio de fecha equivale a cancelar y reservar de nuevo.
- `capacity` se copia del avión en cada vuelo, porque el avión asignado puede cambiar y el vuelo conserva su capacidad.

## Diccionario de datos

### airports: aeropuertos
| Columna | Tipo | Nulo | Llave | Descripción |
|---|---|---|---|---|
| code | CHAR(3) | No | PK | Código IATA (BOG, MDE…) |
| city | VARCHAR(80) | Sí | | Ciudad |

### routes: rutas origen-destino
| Columna | Tipo | Nulo | Llave | Descripción |
|---|---|---|---|---|
| route_code | VARCHAR(7) | No | PK | `ORIGEN-DESTINO`, p. ej. `BOG-MDE` |
| origin | CHAR(3) | No | FK → airports | Aeropuerto de salida |
| destination | CHAR(3) | No | FK → airports | Aeropuerto de llegada. `CHECK origin <> destination` |

### aircraft: aviones de la flota
| Columna | Tipo | Nulo | Llave | Descripción |
|---|---|---|---|---|
| aircraft_id | VARCHAR(10) | No | PK | Matrícula, p. ej. `HK-5021` |
| model | VARCHAR(40) | No | | Modelo (Airbus A320) |
| capacity | INT | No | | Número de sillas (> 0) |

### scheduled_flights: vuelo programado (recurrente)
| Columna | Tipo | Nulo | Llave | Descripción |
|---|---|---|---|---|
| flight_number | VARCHAR(8) | No | PK | Número comercial, p. ej. `AV101` |
| route_code | VARCHAR(7) | No | FK → routes | Ruta que cubre |
| departure_time | TIME | No | | Hora de salida |
| days_of_week | VARCHAR(7) | No | | Días que opera (`1234567` = todos; 1 = lunes) |
| aircraft_id | VARCHAR(10) | Sí | FK → aircraft | Avión asignado por defecto |

### flights: vuelo en una fecha concreta (inventario)
| Columna | Tipo | Nulo | Llave | Descripción |
|---|---|---|---|---|
| flight_id | VARCHAR(32) | No | PK | Identificador del vuelo-fecha |
| flight_number | VARCHAR(8) | Sí | FK → scheduled_flights | Vuelo programado del que proviene. Nulo en vuelos chárter |
| route_code | VARCHAR(7) | No | FK → routes | Ruta. Índice `(route_code, flight_date)` para la búsqueda |
| aircraft_id | VARCHAR(10) | Sí | FK → aircraft | Avión que lo opera |
| flight_date | DATE | No | | Fecha del vuelo. `UNIQUE (flight_number, flight_date)` |
| capacity | INT | No | | Sillas totales |
| seats_available | INT | No | | **Inventario**: sillas libres, `0 ≤ seats_available ≤ capacity` |
| price_cents | BIGINT | No | | Tarifa base en centavos de COP |
| created_at | TIMESTAMPTZ | No | | Fecha de creación del registro |

### passengers: pasajeros
| Columna | Tipo | Nulo | Llave | Descripción |
|---|---|---|---|---|
| passenger_id | BIGSERIAL | No | PK | Identificador interno |
| full_name | VARCHAR(120) | No | | Nombre completo |
| document_id | VARCHAR(20) | Sí | | Documento de identidad (dato personal) |
| email | VARCHAR(120) | Sí | | Correo de contacto (dato personal) |

### fare_rules: reglas de tarifa
| Columna | Tipo | Nulo | Llave | Descripción |
|---|---|---|---|---|
| fare_rule_id | SMALLINT | No | PK | Identificador de la regla |
| fare_class | VARCHAR(10) | No | | `ECONOMY` o `BUSINESS` |
| min_days_before | INT | No | | Anticipación mínima en días para que aplique (0, 7, 21) |
| multiplier | NUMERIC(4,2) | No | | Multiplicador sobre la tarifa base del vuelo |

Se aplica la regla de la clase con el mayor `min_days_before` que no supere los días que faltan para el
vuelo. Por ejemplo, ECONOMY comprado con 30 días de anticipación paga ×1.00, y con 3 días paga ×1.30.

### reservations: reserva (itinerario completo)
| Columna | Tipo | Nulo | Llave | Descripción |
|---|---|---|---|---|
| reservation_id | VARCHAR(40) | No | PK | Código de la reserva |
| passenger_id | BIGINT | No | FK → passengers | Pasajero |
| fare_rule_id | SMALLINT | No | FK → fare_rules | Regla con la que se calculó el precio |
| status | VARCHAR(10) | No | | `CONFIRMED` o `CANCELLED` |
| total_price_cents | BIGINT | No | | Suma de los tramos |
| created_at / updated_at | TIMESTAMPTZ | No | | Creación y último cambio (auditoría básica) |

### reservation_segments: tramos de la reserva
| Columna | Tipo | Nulo | Llave | Descripción |
|---|---|---|---|---|
| reservation_id | VARCHAR(40) | No | PK, FK → reservations | Reserva a la que pertenece |
| segment_no | SMALLINT | No | PK | Orden del tramo (1, 2…) |
| flight_id | VARCHAR(32) | No | FK → flights | Vuelo del tramo; ocupa una silla. `UNIQUE (reservation_id, flight_id)` |
| price_cents | BIGINT | No | | Precio del tramo = tarifa base × multiplicador |

### payments: pagos
| Columna | Tipo | Nulo | Llave | Descripción |
|---|---|---|---|---|
| payment_id | BIGSERIAL | No | PK | Identificador interno |
| reservation_id | VARCHAR(40) | No | FK → reservations, UQ | Un pago por reserva |
| amount_cents | BIGINT | No | | Valor cobrado |
| provider | VARCHAR(30) | No | | Pasarela (`SIMULADO` en el prototipo) |
| provider_ref | VARCHAR(64) | No | | Referencia de la transacción en la pasarela |
| status | VARCHAR(10) | No | | `APPROVED` o `REFUNDED` (al cancelar) |
| created_at | TIMESTAMPTZ | No | | Fecha del cobro |

## Base analítica (airline_olap)

La llena el job de Glue. Ver [`infra/sql/olap_schema.sql`](../infra/sql/olap_schema.sql).

| Tabla | Grano | Columnas |
|---|---|---|
| fact_route_month | ruta × mes | seats_capacity, seats_sold, occupancy, revenue_cents, bookings, cancellations, etl_loaded_at |
| fact_fare_month | clase × mes | revenue_cents, bookings, cancellations, cancel_rate, etl_loaded_at |
