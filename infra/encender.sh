#!/usr/bin/env bash
# Enciende Aurora y la EC2 al empezar una sesion de trabajo. La API arranca sola (docker --restart).
source "$(dirname "$0")/config.sh"

log "Encendiendo el cluster $CLUSTER_ID"
aws rds start-db-cluster --db-cluster-identifier "$CLUSTER_ID" >/dev/null 2>&1 || echo "  (ya estaba encendido o encendiendose)"

INSTANCE=$(aws ec2 describe-instances --filters Name=tag:Name,Values="$EC2_NAME" Name=instance-state-name,Values=stopped,stopping,pending,running \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)
if [[ "$INSTANCE" != "None" ]]; then
  log "Encendiendo la EC2 $INSTANCE"
  STATE=$(aws ec2 describe-instances --instance-ids "$INSTANCE" --query 'Reservations[0].Instances[0].State.Name' --output text)
  [[ "$STATE" == "stopping" ]] && aws ec2 wait instance-stopped --instance-ids "$INSTANCE"
  aws ec2 start-instances --instance-ids "$INSTANCE" >/dev/null
  aws ec2 wait instance-running --instance-ids "$INSTANCE"
fi

log "Esperando a Aurora (5-10 min)"
aws rds wait db-instance-available --db-instance-identifier "$INSTANCE_ID"

if [[ "$INSTANCE" != "None" ]]; then
  IP=$(aws ec2 describe-instances --instance-ids "$INSTANCE" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
  echo "  API: http://$IP:8000   (IP nueva)"
fi
echo "  Si cambiaste de red, actualiza tu IP en el security group $DB_SG_NAME para DBeaver."
