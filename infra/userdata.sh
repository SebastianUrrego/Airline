#!/bin/bash
# Se ejecuta una sola vez, como root, al crear la EC2. __BUCKET__ y __SSM_DB_URL__ los reemplaza 3_ec2_api.sh.
set -euxo pipefail
dnf install -y docker
systemctl enable --now docker

mkdir -p /opt/airline && cd /opt/airline
aws s3 cp s3://__BUCKET__/app/backend.tar.gz .
tar xzf backend.tar.gz

# La cadena de conexion (con la contrasena) vive en SSM Parameter Store, no en el codigo ni en el user-data.
DB_URL=$(aws ssm get-parameter --region us-east-1 --name __SSM_DB_URL__ --with-decryption \
  --query Parameter.Value --output text)
umask 077
echo "DATABASE_URL=$DB_URL" > .env

docker build -t airline-api backend
docker run -d --name airline-api --restart unless-stopped --env-file .env -p 8000:8000 airline-api
