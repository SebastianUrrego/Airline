"""Job ETL de AWS Glue: OLTP (airline) -> OLAP (airline_olap).

Extract:   lee flights, reservations, reservation_segments y fare_rules desde el Glue Data Catalog (tablas creadas por el crawler JDBC).
Transform: agrega por ruta y mes (ocupacion, ingresos, cancelaciones) y por tarifa y mes.
Load:      vacia y vuelve a cargar fact_route_month y fact_fare_month en la base analitica.
"""
import sys

from awsglue.context import GlueContext
from awsglue.job import Job
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext

args = getResolvedOptions(sys.argv, ["JOB_NAME", "OLTP_CATALOG_DB", "OLTP_TABLE_PREFIX", "OLAP_CONNECTION", "OLAP_DB"])

glue = GlueContext(SparkContext())
spark = glue.spark_session
job = Job(glue)
job.init(args["JOB_NAME"], args)


def read_catalog(table):
    return glue.create_dynamic_frame.from_catalog(
        database=args["OLTP_CATALOG_DB"], table_name=args["OLTP_TABLE_PREFIX"] + table).toDF()


for table in ["flights", "reservations", "reservation_segments", "fare_rules"]:
    read_catalog(table).createOrReplaceTempView(table)

# Una fila por tramo: cada tramo ocupa una silla en su vuelo, con el estado y la clase de su reserva.
spark.sql("""
    SELECT s.reservation_id, s.flight_id, s.price_cents, r.status, fr.fare_class
    FROM reservation_segments s
    JOIN reservations r ON r.reservation_id = s.reservation_id
    JOIN fare_rules fr ON fr.fare_rule_id = r.fare_rule_id
""").createOrReplaceTempView("segments")

fact_route_month = spark.sql("""
    WITH f AS (
        SELECT flight_id, route_code AS route, date_format(flight_date, 'yyyy-MM') AS month, capacity
        FROM flights
    ),
    capacity AS (
        SELECT route, month, SUM(capacity) AS seats_capacity FROM f GROUP BY route, month
    ),
    sales AS (
        SELECT f.route, f.month,
               SUM(CASE WHEN r.status = 'CONFIRMED' THEN 1 ELSE 0 END)             AS seats_sold,
               SUM(CASE WHEN r.status = 'CONFIRMED' THEN r.price_cents ELSE 0 END) AS revenue_cents,
               SUM(CASE WHEN r.status = 'CANCELLED' THEN 1 ELSE 0 END)             AS cancellations
        FROM segments r JOIN f ON r.flight_id = f.flight_id
        GROUP BY f.route, f.month
    )
    SELECT c.route, c.month,
           CAST(c.seats_capacity AS BIGINT)                                    AS seats_capacity,
           CAST(COALESCE(s.seats_sold, 0) AS BIGINT)                           AS seats_sold,
           CAST(COALESCE(s.seats_sold, 0) AS DOUBLE) / c.seats_capacity        AS occupancy,
           CAST(COALESCE(s.revenue_cents, 0) AS BIGINT)                        AS revenue_cents,
           CAST(COALESCE(s.seats_sold, 0) AS BIGINT)                           AS bookings,
           CAST(COALESCE(s.cancellations, 0) AS BIGINT)                        AS cancellations
    FROM capacity c LEFT JOIN sales s ON c.route = s.route AND c.month = s.month
""")

fact_fare_month = spark.sql("""
    SELECT r.fare_class,
           date_format(f.flight_date, 'yyyy-MM')                                       AS month,
           CAST(SUM(CASE WHEN r.status = 'CONFIRMED' THEN r.price_cents ELSE 0 END) AS BIGINT) AS revenue_cents,
           CAST(SUM(CASE WHEN r.status = 'CONFIRMED' THEN 1 ELSE 0 END) AS BIGINT)     AS bookings,
           CAST(SUM(CASE WHEN r.status = 'CANCELLED' THEN 1 ELSE 0 END) AS BIGINT)     AS cancellations,
           SUM(CASE WHEN r.status = 'CANCELLED' THEN 1 ELSE 0 END) / COUNT(*)          AS cancel_rate
    FROM segments r JOIN flights f ON r.flight_id = f.flight_id
    GROUP BY r.fare_class, date_format(f.flight_date, 'yyyy-MM')
""")

# Credenciales tomadas de la conexion de Glue: no quedan escritas en el script.
conf = glue.extract_jdbc_conf(args["OLAP_CONNECTION"])
url = (conf.get("fullUrl") or conf["url"]).split("?")[0]
if url.count("/") <= 2:  # jdbc:postgresql://host:5432 sin nombre de base
    url = url.rstrip("/") + "/" + args["OLAP_DB"]
props = {"user": conf["user"], "password": conf["password"], "driver": "org.postgresql.Driver"}

for name, df in [("fact_route_month", fact_route_month), ("fact_fare_month", fact_fare_month)]:
    # overwrite + truncate: vacia la tabla y conserva su definicion (llave primaria, etl_loaded_at).
    df.write.option("truncate", "true").jdbc(url, name, mode="overwrite", properties=props)
    print(f"{name}: {df.count()} filas cargadas")

job.commit()
