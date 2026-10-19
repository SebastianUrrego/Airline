# Sistema de reservas de aerolínea — Parcial 1

API en FastAPI sobre una EC2, con **Amazon Aurora PostgreSQL** (base OLTP `airline` y base OLAP
`airline_olap`), un ETL en **AWS Glue** y ambas bases registradas en el **Glue Data Catalog**.
Las bases se administran desde **DBeaver**. La arquitectura y los costos están en
[docs/arquitectura.md](docs/arquitectura.md).

```
airline-system/
├── backend/                 # API (FastAPI) + schema.sql (modelo entidad-relación) + Dockerfile
├── infra/                   # scripts de CloudShell que crean todo en AWS
│   ├── 1_red_y_aurora.sh    #   security groups, endpoint S3, cluster Aurora      (~15 min)
│   ├── 2_esquemas_y_datos.sh#   tablas OLTP, base airline_olap, datos de ejemplo  (~2 min)
│   ├── 3_ec2_api.sh         #   bucket S3, SSM, EC2 con la API en Docker          (~5 min)
│   ├── 4_glue.sh            #   catálogo, conexiones, crawlers y job ETL          (~10 min)
│   ├── apagar.sh / encender.sh
│   ├── glue/etl_oltp_to_olap.py
│   └── sql/ (olap_schema.sql, seed.sql)
├── tests/test_api.py        # pruebas funcionales + prueba de concurrencia
└── docs/arquitectura.md
```

## 1. Crear la infraestructura (AWS CloudShell)

1. En AWS Academy: **Start Lab**. Cuando el punto esté en verde, abre **AWS**. Región: **N. Virginia (us-east-1)**.
2. Abre **CloudShell**, el ícono `>_` de la barra superior.
3. Ve a **Actions → Upload file** y sube `airline-system.zip`.
4. Ejecuta en CloudShell:

```bash
unzip -o airline-system.zip -d airline-system && cd airline-system/infra
sed -i 's/\r$//' *.sh sql/*.sql glue/*.py   # por si algún archivo llegó con saltos de línea de Windows
bash 1_red_y_aurora.sh
```

   - El script pide la **contraseña de Aurora** (8 a 41 caracteres, solo letras y números) y la
     **IP pública de tu PC**, que puedes ver abriendo <https://checkip.amazonaws.com> en tu navegador.
     Ambas quedan guardadas en `~/.airline/` dentro de CloudShell, que es privado.
   - Mientras espera a Aurora, **toca una tecla cada pocos minutos**. CloudShell cierra la sesión a los
     ~20 minutos sin actividad del teclado. Si se cierra, vuelve a ejecutar el mismo script: retoma desde
     donde iba.

5. Ejecuta las demás etapas en orden:

```bash
bash 2_esquemas_y_datos.sh
bash 3_ec2_api.sh
bash 4_glue.sh
```

Cada etapa imprime lo que creó. La 3 imprime la URL de la API y la 4 deja las tablas de ambas bases
en el Data Catalog.

### Qué se crea

| Recurso | Nombre |
|---|---|
| Cluster Aurora PostgreSQL 16, 1 instancia db.t3.medium, cifrado, sin réplica | `airline-aurora` / `airline-aurora-1` |
| Bases de datos | `airline` (OLTP), `airline_olap` (OLAP) |
| Security groups | `airline-db-sg`, `airline-api-sg` |
| Endpoint Gateway de S3 (gratis) | en la VPC por defecto |
| Bucket S3 | `airline-<id de la cuenta>` |
| Parámetro SSM (SecureString) | `/airline/database_url` |
| EC2 t3.small con LabInstanceProfile | `airline-api` |
| Glue: bases del catálogo | `airline_oltp`, `airline_olap` |
| Glue: conexiones JDBC | `airline-oltp-conn`, `airline-olap-conn` |
| Glue: crawlers | `airline-oltp-crawler`, `airline-olap-crawler` |
| Glue: job ETL | `airline-etl-oltp-to-olap` |

### Costos: IMPORTANTE
Aurora cuesta ~US$2 diarios si se deja encendido, y el presupuesto del Learner Lab es de US$50.
**Al terminar cada sesión de trabajo:**

```bash
cd ~/airline-system/infra && bash apagar.sh
```

Para retomar: `bash encender.sh`. La IP de la EC2 cambia cada vez que se enciende.

## 2. Conectar DBeaver

1. **Database → New Database Connection → PostgreSQL**. Si DBeaver pide descargar el driver, acepta.
2. Pestaña **Main**:
   - Host: el endpoint que imprimió la etapa 1 (`airline-aurora.cluster-xxxx.us-east-1.rds.amazonaws.com`)
   - Port: `5432`
   - Database: `airline`
   - Username: `airline_admin`, y la contraseña que eligieron
   - Marca **Show all databases** para ver también `airline_olap`.
3. Pestaña **SSL**: marca *Use SSL* y en *SSL mode* elige `require`.
4. Haz clic en **Test Connection**. Si da timeout, revisa que tu IP actual sea la que diste en la etapa 1.
   Si cambiaste de red, ve a EC2 → Security Groups → `airline-db-sg` → Edit inbound rules y cambia la
   regla "DBeaver" por tu IP nueva.

Consultas útiles para los pantallazos del documento:

```sql
-- OLTP: ningún vuelo tiene más confirmadas que su capacidad
SELECT f.flight_id, f.capacity, f.seats_available,
       COUNT(r.*) FILTER (WHERE r.status = 'CONFIRMED') AS confirmadas
FROM flights f LEFT JOIN reservations r USING (flight_id)
GROUP BY f.flight_id ORDER BY f.created_at DESC LIMIT 20;

-- OLAP (base airline_olap): ocupación por ruta y mes que cargó el ETL
SELECT route, month, round(occupancy * 100, 1) AS ocupacion_pct, revenue_cents / 100 AS ingresos_cop
FROM fact_route_month ORDER BY occupancy DESC LIMIT 10;
```

## 3. La API

| Método y ruta | Qué hace | Respuestas |
|---|---|---|
| `POST /admin/flights` | Crea un vuelo `{flight_id, route, flight_date, capacity, price_cents}` | 201 · 409 si el id ya existe |
| `GET /flights/search?origin=BOG&destination=MDE&date=2026-03-10` | Vuelos con sillas disponibles | 200 lista · 422 si los parámetros no son válidos |
| `POST /reservations` | Reserva `{flight_id, passenger_name, fare_class}`. Opcional: `connection_flight_ids` (tramos con escala), `document_id`, `email` | 201 · 409 si algún tramo no tiene sillas · 404 si un vuelo no existe · 422 si los tramos no conectan |
| `GET /reservations/{id}` | Consulta una reserva | 200 · 404 |
| `POST /reservations/{id}/cancel` | Cancela la reserva y devuelve la silla al inventario | 200 · 409 si ya estaba cancelada · 404 |
| `GET /health` | Estado de la API | 200 |

La documentación interactiva queda en `http://<IP de la EC2>:8000/docs`.

Para correrla en tu PC contra Aurora: copia `.env.example` a `.env`, completa `DATABASE_URL` y ejecuta
`docker compose up --build api`. Tu IP debe estar en `airline-db-sg`.

## 4. Prueba de concurrencia (evidencia de que no hay sobreventa)

Desde tu PC, con la API en la EC2 encendida:

```powershell
pip install -r tests\requirements.txt
$env:BASE_URL = "http://<IP de la EC2>:8000"
pytest -v -s tests\ | Tee-Object evidencia_pruebas.txt
```

`test_concurrency_exactly_k` crea un vuelo con 1 silla y lanza **50 reservas simultáneas**, liberadas al
mismo tiempo con una barrera. Repite esto 5 rondas, y luego lo mismo con 5 sillas. Debe imprimir
`201=1 409=49` (y `201=5 409=45`) en cada ronda.

### Cómo se evita la sobreventa
La reserva hace un `UPDATE` condicional y atómico dentro de una transacción:

```sql
UPDATE flights SET seats_available = seats_available - 1
WHERE flight_id = $1 AND seats_available > 0
RETURNING price_cents;
```

PostgreSQL bloquea la fila del vuelo mientras dura la transacción. Las demás peticiones sobre ese vuelo
esperan, y cuando se libera el bloqueo vuelven a evaluar `seats_available > 0` con el valor ya
actualizado. Si no se actualiza ninguna fila, la respuesta es **409**. Es un bloqueo pesimista a nivel
de fila, implícito en el `UPDATE`, así que no hacen falta reintentos ni colas. Además, el `CHECK
(seats_available BETWEEN 0 AND capacity)` de la tabla impide un valor negativo aunque hubiera un error
en el código.

## 5. El ETL (Glue)

`infra/glue/etl_oltp_to_olap.py`:

1. Lee `flights` y `reservations` desde el Data Catalog (tablas que creó `airline-oltp-crawler`).
2. Agrega por ruta y mes: capacidad, sillas vendidas, ocupación, ingresos y cancelaciones.
3. Agrega por tarifa y mes: ingresos, reservas, cancelaciones y tasa de cancelación.
4. Vacía y vuelve a cargar `fact_route_month` y `fact_fare_month` en `airline_olap`.

Se ejecuta bajo demanda con `aws glue start-job-run --job-name airline-etl-oltp-to-olap`, o desde la
consola en Glue → ETL jobs → Run.
