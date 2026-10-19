#!/usr/bin/env bash
# Detiene Aurora y la EC2 para no gastar presupuesto. Glue, S3 y SSM no cobran mientras no se usan.
source "$(dirname "$0")/config.sh"

log "Deteniendo el cluster $CLUSTER_ID (AWS lo vuelve a encender solo a los 7 dias)"
aws rds stop-db-cluster --db-cluster-identifier "$CLUSTER_ID" >/dev/null 2>&1 || echo "  (ya estaba detenido o deteniendose)"

INSTANCE=$(aws ec2 describe-instances --filters Name=tag:Name,Values="$EC2_NAME" Name=instance-state-name,Values=pending,running \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)
if [[ "$INSTANCE" != "None" ]]; then
  log "Deteniendo la EC2 $INSTANCE"
  aws ec2 stop-instances --instance-ids "$INSTANCE" >/dev/null
fi
log "Listo"
