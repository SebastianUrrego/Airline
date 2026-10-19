# Variables y funciones comunes. Lo cargan los demas scripts con: source config.sh
set -euo pipefail

export AWS_DEFAULT_REGION=us-east-1
export AWS_PAGER=""

CLUSTER_ID=airline-aurora
INSTANCE_ID=airline-aurora-1
DB_CLASS=db.t3.medium
DB_MAJOR=16
DB_USER=airline_admin
OLTP_DB=airline
OLAP_DB=airline_olap
PARAM_GROUP=airline-aurora-pg${DB_MAJOR}
SUBNET_GROUP=airline-db-subnets
DB_SG_NAME=airline-db-sg
API_SG_NAME=airline-api-sg
EC2_TYPE=t3.small
EC2_NAME=airline-api
AZ=us-east-1a
SSM_DB_URL=/airline/database_url
GLUE_OLTP_DB=airline_oltp
GLUE_OLAP_DB=airline_olap
GLUE_OLTP_CONN=airline-oltp-conn
GLUE_OLAP_CONN=airline-olap-conn
GLUE_JOB=airline-etl-oltp-to-olap

SECRETS_DIR="$HOME/.airline"   # home de CloudShell: privado y persistente
INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$INFRA_DIR")"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET=airline-${ACCOUNT_ID}
LAB_ROLE_ARN=arn:aws:iam::${ACCOUNT_ID}:role/LabRole
VPC_ID=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
SUBNET_ID=$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC_ID" Name=availability-zone,Values="$AZ" \
  --query 'Subnets[0].SubnetId' --output text)

log() { printf '\n==> %s\n' "$*"; }

sg_id() {
  aws ec2 describe-security-groups --filters Name=vpc-id,Values="$VPC_ID" Name=group-name,Values="$1" \
    --query 'SecurityGroups[0].GroupId' --output text
}

# Agrega una regla de entrada; si ya existe, no hace nada.
allow_ingress() {
  local out
  out=$(aws ec2 authorize-security-group-ingress --group-id "$1" --ip-permissions "$2" 2>&1) || {
    grep -q 'Duplicate' <<<"$out" || { echo "$out" >&2; return 1; }
  }
}

db_password() { cat "$SECRETS_DIR/db_password"; }
my_ip() { cat "$SECRETS_DIR/my_ip"; }
db_endpoint() {
  aws rds describe-db-clusters --db-cluster-identifier "$CLUSTER_ID" --query 'DBClusters[0].Endpoint' --output text
}
