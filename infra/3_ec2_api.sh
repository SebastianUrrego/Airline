#!/usr/bin/env bash
# Etapa 3: bucket S3, cadena de conexion en SSM y EC2 t3.small con la API en Docker.
source "$(dirname "$0")/config.sh"

log "Bucket s3://$BUCKET (codigo de la API y scripts de Glue)"
aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null || aws s3api create-bucket --bucket "$BUCKET" >/dev/null

log "Subiendo el backend"
tar czf /tmp/backend.tar.gz --exclude='__pycache__' --exclude='.venv' -C "$ROOT_DIR" backend
aws s3 cp /tmp/backend.tar.gz "s3://$BUCKET/app/backend.tar.gz" --only-show-errors

log "Cadena de conexion en SSM Parameter Store ($SSM_DB_URL, cifrada)"
aws ssm put-parameter --name "$SSM_DB_URL" --type SecureString --overwrite \
  --value "postgresql://${DB_USER}:$(db_password)@$(db_endpoint):5432/${OLTP_DB}?sslmode=require" >/dev/null

INSTANCE=$(aws ec2 describe-instances \
  --filters Name=tag:Name,Values="$EC2_NAME" Name=instance-state-name,Values=pending,running,stopping,stopped \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)

if [[ "$INSTANCE" == "None" ]]; then
  log "Creando la EC2 $EC2_NAME ($EC2_TYPE, Amazon Linux 2023)"
  AMI=$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
    --query Parameter.Value --output text)
  sed -e "s|__BUCKET__|$BUCKET|g" -e "s|__SSM_DB_URL__|$SSM_DB_URL|g" "$INFRA_DIR/userdata.sh" > /tmp/userdata.sh
  INSTANCE=$(aws ec2 run-instances \
    --image-id "$AMI" --instance-type "$EC2_TYPE" \
    --subnet-id "$SUBNET_ID" --security-group-ids "$(sg_id "$API_SG_NAME")" \
    --associate-public-ip-address \
    --key-name vockey \
    --iam-instance-profile Name=LabInstanceProfile \
    --user-data file:///tmp/userdata.sh \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$EC2_NAME}]" \
    --query 'Instances[0].InstanceId' --output text)
else
  log "La EC2 ya existe ($INSTANCE); se enciende si estaba apagada"
  aws ec2 start-instances --instance-ids "$INSTANCE" >/dev/null
fi

aws ec2 wait instance-running --instance-ids "$INSTANCE"
IP=$(aws ec2 describe-instances --instance-ids "$INSTANCE" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

log "Esperando a que la API responda en http://$IP:8000/health (instalar Docker y construir la imagen tarda 3-5 min)"
for _ in $(seq 60); do
  if curl -fs --max-time 3 "http://$IP:8000/health" >/dev/null; then
    echo "  La API esta arriba."
    break
  fi
  sleep 10
done

log "Listo"
echo "  API:  http://$IP:8000      Documentacion: http://$IP:8000/docs"
echo "  (la IP publica cambia cada vez que la EC2 se apaga y se enciende)"
echo "  Siguiente: bash 4_glue.sh"
