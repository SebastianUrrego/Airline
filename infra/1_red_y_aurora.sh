#!/usr/bin/env bash
# Etapa 1: security groups, endpoint S3 y cluster Aurora PostgreSQL (tarda ~15 min).
# Se puede volver a ejecutar: lo que ya existe se deja como esta.
source "$(dirname "$0")/config.sh"

mkdir -p "$SECRETS_DIR" && chmod 700 "$SECRETS_DIR"

if [[ ! -f "$SECRETS_DIR/db_password" ]]; then
  echo "Contrasena del usuario maestro de Aurora (8-41 caracteres, solo letras y numeros):"
  read -rsp "  contrasena: " p1; echo
  read -rsp "  repitela:   " p2; echo
  [[ "$p1" == "$p2" ]] || { echo "No coinciden." >&2; exit 1; }
  [[ "$p1" =~ ^[A-Za-z0-9]{8,41}$ ]] || { echo "Formato no valido." >&2; exit 1; }
  (umask 077; printf '%s' "$p1" > "$SECRETS_DIR/db_password")
fi

if [[ ! -f "$SECRETS_DIR/my_ip" ]]; then
  echo "IP publica de TU PC (abre https://checkip.amazonaws.com en tu navegador):"
  read -rp "  IP: " ip
  [[ "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || { echo "IP no valida." >&2; exit 1; }
  printf '%s' "$ip" > "$SECRETS_DIR/my_ip"
fi

log "VPC por defecto: $VPC_ID, subred $SUBNET_ID ($AZ)"

log "Security groups"
[[ "$(sg_id "$DB_SG_NAME")" == "None" ]] && aws ec2 create-security-group --group-name "$DB_SG_NAME" \
  --description "Aurora: DBeaver, API y Glue" --vpc-id "$VPC_ID" >/dev/null
[[ "$(sg_id "$API_SG_NAME")" == "None" ]] && aws ec2 create-security-group --group-name "$API_SG_NAME" \
  --description "EC2 de la API" --vpc-id "$VPC_ID" >/dev/null
DB_SG=$(sg_id "$DB_SG_NAME")
API_SG=$(sg_id "$API_SG_NAME")

allow_ingress "$DB_SG" "[{\"IpProtocol\":\"tcp\",\"FromPort\":5432,\"ToPort\":5432,\"IpRanges\":[{\"CidrIp\":\"$(my_ip)/32\",\"Description\":\"DBeaver\"}]}]"
allow_ingress "$DB_SG" "[{\"IpProtocol\":\"tcp\",\"FromPort\":5432,\"ToPort\":5432,\"UserIdGroupPairs\":[{\"GroupId\":\"$API_SG\",\"Description\":\"API en EC2\"}]}]"
# Glue exige una regla que permita todo TCP desde el mismo security group.
allow_ingress "$DB_SG" "[{\"IpProtocol\":\"tcp\",\"FromPort\":0,\"ToPort\":65535,\"UserIdGroupPairs\":[{\"GroupId\":\"$DB_SG\",\"Description\":\"Glue self-reference\"}]}]"
allow_ingress "$API_SG" "[{\"IpProtocol\":\"tcp\",\"FromPort\":8000,\"ToPort\":8000,\"IpRanges\":[{\"CidrIp\":\"0.0.0.0/0\",\"Description\":\"API publica\"}]}]"
allow_ingress "$API_SG" "[{\"IpProtocol\":\"tcp\",\"FromPort\":22,\"ToPort\":22,\"IpRanges\":[{\"CidrIp\":\"$(my_ip)/32\",\"Description\":\"SSH\"}]}]"
echo "  $DB_SG_NAME=$DB_SG  $API_SG_NAME=$API_SG"

log "Endpoint Gateway de S3 (gratis; Glue lo necesita dentro de la VPC, evita un NAT Gateway)"
EP=$(aws ec2 describe-vpc-endpoints --filters Name=vpc-id,Values="$VPC_ID" \
  Name=service-name,Values="com.amazonaws.${AWS_DEFAULT_REGION}.s3" Name=vpc-endpoint-type,Values=Gateway \
  --query 'VpcEndpoints[0].VpcEndpointId' --output text)
if [[ "$EP" == "None" ]]; then
  RTS=$(aws ec2 describe-route-tables --filters Name=vpc-id,Values="$VPC_ID" --query 'RouteTables[].RouteTableId' --output text)
  # shellcheck disable=SC2086
  aws ec2 create-vpc-endpoint --vpc-id "$VPC_ID" --vpc-endpoint-type Gateway \
    --service-name "com.amazonaws.${AWS_DEFAULT_REGION}.s3" --route-table-ids $RTS >/dev/null
fi

log "Version de Aurora PostgreSQL $DB_MAJOR que admite $DB_CLASS"
ENGINE_VERSION=$(aws rds describe-orderable-db-instance-options --engine aurora-postgresql --db-instance-class "$DB_CLASS" \
  --query "OrderableDBInstanceOptions[?starts_with(EngineVersion, '${DB_MAJOR}.')].EngineVersion" --output text \
  | tr '\t' '\n' | sort -uV | tail -1)
[[ -n "$ENGINE_VERSION" ]] || { echo "No hay version $DB_MAJOR.x para $DB_CLASS" >&2; exit 1; }
echo "  $ENGINE_VERSION"

log "Grupo de parametros del cluster"
if ! aws rds describe-db-cluster-parameter-groups --db-cluster-parameter-group-name "$PARAM_GROUP" >/dev/null 2>&1; then
  aws rds create-db-cluster-parameter-group --db-cluster-parameter-group-name "$PARAM_GROUP" \
    --db-parameter-group-family "aurora-postgresql${DB_MAJOR}" --description "Aurora del sistema de reservas" >/dev/null
  # SSL opcional en el servidor: DBeaver y la API lo usan igual (sslmode=require);
  # Glue se conecta dentro de la VPC sin tener que instalar el certificado de RDS.
  aws rds modify-db-cluster-parameter-group --db-cluster-parameter-group-name "$PARAM_GROUP" \
    --parameters "ParameterName=rds.force_ssl,ParameterValue=0,ApplyMethod=pending-reboot" >/dev/null
fi

log "Grupo de subredes (todas las subredes de la VPC por defecto)"
if ! aws rds describe-db-subnet-groups --db-subnet-group-name "$SUBNET_GROUP" >/dev/null 2>&1; then
  SUBNETS=$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC_ID" --query 'Subnets[].SubnetId' --output text)
  # shellcheck disable=SC2086
  aws rds create-db-subnet-group --db-subnet-group-name "$SUBNET_GROUP" \
    --db-subnet-group-description "Subredes de la VPC por defecto" --subnet-ids $SUBNETS >/dev/null
fi

log "Cluster Aurora $CLUSTER_ID"
if ! aws rds describe-db-clusters --db-cluster-identifier "$CLUSTER_ID" >/dev/null 2>&1; then
  aws rds create-db-cluster \
    --db-cluster-identifier "$CLUSTER_ID" \
    --engine aurora-postgresql --engine-version "$ENGINE_VERSION" \
    --master-username "$DB_USER" --master-user-password "$(db_password)" \
    --database-name "$OLTP_DB" \
    --db-cluster-parameter-group-name "$PARAM_GROUP" \
    --db-subnet-group-name "$SUBNET_GROUP" \
    --vpc-security-group-ids "$DB_SG" \
    --storage-encrypted \
    --backup-retention-period 1 \
    --no-deletion-protection >/dev/null
fi

log "Instancia $INSTANCE_ID ($DB_CLASS, una sola, sin replica)"
if ! aws rds describe-db-instances --db-instance-identifier "$INSTANCE_ID" >/dev/null 2>&1; then
  aws rds create-db-instance \
    --db-instance-identifier "$INSTANCE_ID" \
    --db-cluster-identifier "$CLUSTER_ID" \
    --engine aurora-postgresql \
    --db-instance-class "$DB_CLASS" \
    --publicly-accessible \
    --no-enable-performance-insights \
    --monitoring-interval 0 >/dev/null
fi

log "Esperando a que la instancia quede disponible (10-15 min; toca una tecla de vez en cuando para que CloudShell no se cierre)"
aws rds wait db-instance-available --db-instance-identifier "$INSTANCE_ID"

log "Listo"
echo "  Endpoint de escritura: $(db_endpoint)"
echo "  Usuario: $DB_USER   Base: $OLTP_DB   Puerto: 5432"
echo "  Siguiente: bash 2_esquemas_y_datos.sh"
