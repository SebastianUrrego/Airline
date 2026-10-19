#!/usr/bin/env bash
# Etapa 2: crea las tablas OLTP, la base analitica airline_olap y carga datos de ejemplo.
source "$(dirname "$0")/config.sh"

if ! command -v psql >/dev/null; then
  log "Instalando el cliente psql en CloudShell"
  sudo dnf install -y -q postgresql15
fi

# CloudShell tiene su propia IP publica: se abre el puerto solo mientras corre este script.
DB_SG=$(sg_id "$DB_SG_NAME")
CS_IP=$(curl -s https://checkip.amazonaws.com)
RULE="[{\"IpProtocol\":\"tcp\",\"FromPort\":5432,\"ToPort\":5432,\"IpRanges\":[{\"CidrIp\":\"${CS_IP}/32\",\"Description\":\"CloudShell temporal\"}]}]"
allow_ingress "$DB_SG" "$RULE"
cleanup() { aws ec2 revoke-security-group-ingress --group-id "$DB_SG" --ip-permissions "$RULE" >/dev/null 2>&1 || true; }
trap cleanup EXIT

export PGHOST
PGHOST=$(db_endpoint)
export PGUSER=$DB_USER PGPORT=5432 PGSSLMODE=require PGCONNECT_TIMEOUT=15
export PGPASSWORD
PGPASSWORD=$(db_password)
PSQL=(psql -v ON_ERROR_STOP=1 -q)

log "Tablas OLTP en la base $OLTP_DB"
"${PSQL[@]}" -d "$OLTP_DB" -f "$ROOT_DIR/backend/schema.sql"

log "Base analitica $OLAP_DB"
if [[ "$("${PSQL[@]}" -d "$OLTP_DB" -tAc "SELECT 1 FROM pg_database WHERE datname = '$OLAP_DB'")" != "1" ]]; then
  "${PSQL[@]}" -d "$OLTP_DB" -c "CREATE DATABASE $OLAP_DB"
fi
"${PSQL[@]}" -d "$OLAP_DB" -f "$INFRA_DIR/sql/olap_schema.sql"

log "Datos de ejemplo"
if [[ "$("${PSQL[@]}" -d "$OLTP_DB" -tAc "SELECT count(*) FROM flights WHERE flight_id LIKE 'S%'")" == "0" ]]; then
  "${PSQL[@]}" -d "$OLTP_DB" -f "$INFRA_DIR/sql/seed.sql"
else
  echo "  Ya estaban cargados; no se duplican."
fi

"${PSQL[@]}" -d "$OLTP_DB" -c "
  SELECT (SELECT count(*) FROM routes) AS rutas,
         (SELECT count(*) FROM flights) AS vuelos,
         (SELECT count(*) FROM passengers) AS pasajeros,
         (SELECT count(*) FROM reservations) AS reservas,
         (SELECT count(*) FROM reservation_segments) AS tramos,
         (SELECT count(*) FROM flights f WHERE f.capacity - f.seats_available <>
            (SELECT count(*) FROM reservation_segments s JOIN reservations r USING (reservation_id)
             WHERE s.flight_id = f.flight_id AND r.status = 'CONFIRMED')
         ) AS vuelos_inconsistentes;"

log "Listo. Siguiente: bash 3_ec2_api.sh"
