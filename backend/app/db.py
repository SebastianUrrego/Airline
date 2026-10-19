import os
from pathlib import Path

from psycopg_pool import ConnectionPool

# En AWS apunta al endpoint de escritura del cluster Aurora PostgreSQL (ver .env.example).
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://airline:airline@localhost:5432/airline")
SCHEMA_FILE = Path(__file__).resolve().parent.parent / "schema.sql"

# Un pool por proceso de uvicorn. Con 2 workers x 20 conexiones = 40, por debajo
# del max_connections=100 por defecto de PostgreSQL.
pool = ConnectionPool(
    DATABASE_URL,
    min_size=2,
    max_size=int(os.environ.get("DB_POOL_SIZE", "20")),
    open=False,
)


def init_schema() -> None:
    # El advisory lock evita que dos workers creen las tablas al mismo tiempo.
    with pool.connection() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(42)")
        conn.execute(SCHEMA_FILE.read_text(encoding="utf-8"))
