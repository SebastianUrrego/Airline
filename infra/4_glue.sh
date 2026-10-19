#!/usr/bin/env bash
# Etapa 4: Glue Data Catalog (2 bases), 2 conexiones JDBC, 2 crawlers y el job ETL OLTP -> OLAP.
# Al final ejecuta todo en orden: crawler OLTP -> job ETL -> crawler OLAP.
source "$(dirname "$0")/config.sh"

DB_SG=$(sg_id "$DB_SG_NAME")
HOST=$(db_endpoint)

log "Bases del Data Catalog"
for db in "$GLUE_OLTP_DB" "$GLUE_OLAP_DB"; do
  aws glue get-database --name "$db" >/dev/null 2>&1 || aws glue create-database --database-input "{\"Name\":\"$db\"}"
done

# Crea la conexion o la actualiza si ya existe (por ejemplo, si cambio la contrasena).
upsert_connection() {
  local name=$1 database=$2 input
  input=$(cat <<EOF
{"Name": "$name", "ConnectionType": "JDBC",
 "ConnectionProperties": {"JDBC_CONNECTION_URL": "jdbc:postgresql://$HOST:5432/$database",
                          "USERNAME": "$DB_USER", "PASSWORD": "$(db_password)", "JDBC_ENFORCE_SSL": "false"},
 "PhysicalConnectionRequirements": {"SubnetId": "$SUBNET_ID", "SecurityGroupIdList": ["$DB_SG"],
                                    "AvailabilityZone": "$AZ"}}
EOF
)
  if aws glue get-connection --name "$name" >/dev/null 2>&1; then
    aws glue update-connection --name "$name" --connection-input "$input"
  else
    aws glue create-connection --connection-input "$input"
  fi
}

log "Conexiones JDBC"
upsert_connection "$GLUE_OLTP_CONN" "$OLTP_DB"
upsert_connection "$GLUE_OLAP_CONN" "$OLAP_DB"

log "Crawlers"
create_crawler() {
  local name=$1 catalog_db=$2 conn=$3 path=$4
  aws glue get-crawler --name "$name" >/dev/null 2>&1 && return
  aws glue create-crawler --name "$name" --role "$LAB_ROLE_ARN" --database-name "$catalog_db" \
    --targets "{\"JdbcTargets\":[{\"ConnectionName\":\"$conn\",\"Path\":\"$path\"}]}"
}
create_crawler airline-oltp-crawler "$GLUE_OLTP_DB" "$GLUE_OLTP_CONN" "$OLTP_DB/public/%"
create_crawler airline-olap-crawler "$GLUE_OLAP_DB" "$GLUE_OLAP_CONN" "$OLAP_DB/public/%"

run_crawler() {
  local name=$1 state status
  log "Ejecutando el crawler $name (1-3 min)"
  aws glue start-crawler --name "$name" 2>/dev/null || true   # si ya estaba corriendo, solo se espera
  sleep 20
  while state=$(aws glue get-crawler --name "$name" --query Crawler.State --output text); [[ "$state" != "READY" ]]; do
    echo "  $state..."; sleep 20
  done
  status=$(aws glue get-crawler --name "$name" --query Crawler.LastCrawl.Status --output text)
  echo "  Resultado: $status"
  [[ "$status" == "SUCCEEDED" ]] || {
    aws glue get-crawler --name "$name" --query Crawler.LastCrawl.ErrorMessage --output text >&2; exit 1; }
}

run_crawler airline-oltp-crawler
aws glue get-tables --database-name "$GLUE_OLTP_DB" --query 'TableList[].Name' --output table

# El crawler JDBC nombra las tablas <base>_<esquema>_<tabla>; se deduce el prefijo de la tabla de vuelos.
FLIGHTS_TABLE=$(aws glue get-tables --database-name "$GLUE_OLTP_DB" \
  --query "TableList[?ends_with(Name, '_flights')].Name | [0]" --output text)
[[ "$FLIGHTS_TABLE" != "None" ]] || { echo "El crawler no creo la tabla de vuelos" >&2; exit 1; }
PREFIX=${FLIGHTS_TABLE%flights}

log "Job ETL $GLUE_JOB (Glue 4.0, 2 workers G.1X)"
aws s3 cp "$INFRA_DIR/glue/etl_oltp_to_olap.py" "s3://$BUCKET/glue/etl_oltp_to_olap.py" --only-show-errors
JOB_JSON=$(cat <<EOF
{"Role": "$LAB_ROLE_ARN",
 "Command": {"Name": "glueetl", "ScriptLocation": "s3://$BUCKET/glue/etl_oltp_to_olap.py", "PythonVersion": "3"},
 "Connections": {"Connections": ["$GLUE_OLTP_CONN", "$GLUE_OLAP_CONN"]},
 "DefaultArguments": {"--OLTP_CATALOG_DB": "$GLUE_OLTP_DB", "--OLTP_TABLE_PREFIX": "$PREFIX",
                      "--OLAP_CONNECTION": "$GLUE_OLAP_CONN", "--OLAP_DB": "$OLAP_DB",
                      "--TempDir": "s3://$BUCKET/glue/tmp/", "--job-language": "python"},
 "GlueVersion": "4.0", "WorkerType": "G.1X", "NumberOfWorkers": 2, "Timeout": 15, "MaxRetries": 0}
EOF
)
if aws glue get-job --job-name "$GLUE_JOB" >/dev/null 2>&1; then
  aws glue update-job --job-name "$GLUE_JOB" --job-update "$JOB_JSON" >/dev/null
else
  aws glue create-job --name "$GLUE_JOB" --cli-input-json "$(sed '1s/^{/{"Name": "'"$GLUE_JOB"'", /' <<<"$JOB_JSON")" >/dev/null
fi

log "Ejecutando el job ETL (2-4 min)"
RUN_ID=$(aws glue start-job-run --job-name "$GLUE_JOB" --query JobRunId --output text)
while state=$(aws glue get-job-run --job-name "$GLUE_JOB" --run-id "$RUN_ID" --query JobRun.JobRunState --output text);
      [[ "$state" =~ ^(STARTING|RUNNING|WAITING|STOPPING)$ ]]; do
  echo "  $state..."; sleep 20
done
echo "  Resultado: $state"
if [[ "$state" != "SUCCEEDED" ]]; then
  aws glue get-job-run --job-name "$GLUE_JOB" --run-id "$RUN_ID" --query JobRun.ErrorMessage --output text >&2
  exit 1
fi

run_crawler airline-olap-crawler
aws glue get-tables --database-name "$GLUE_OLAP_DB" --query 'TableList[].Name' --output table

log "Listo. En DBeaver, conectate a la base $OLAP_DB y revisa fact_route_month y fact_fare_month."
echo "  Para volver a correr el ETL: aws glue start-job-run --job-name $GLUE_JOB"
