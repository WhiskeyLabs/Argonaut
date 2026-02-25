#!/bin/bash
set -euo pipefail

# Configuration
GPU_NODE_IP="172.239.44.229"
DOMAIN="argus.whiskeylabs.io"
APP_ROOT="/opt/argus"
NGINX_SITE="argus"

echo ">>> Starting Web Node Setup..."

# 1. Install Docker
echo ">>> Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
fi

# 2. Create Docker Compose with Open WebUI
echo ">>> Configuring Services..."
mkdir -p "$APP_ROOT"
cd "$APP_ROOT"

cat <<EOF > docker-compose.yml
version: '3.8'
services:
  # The Admin Chat Interface
  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    restart: always
    ports:
      - "8080:8080"
    environment:
      - OPENAI_API_BASE_URL=http://${GPU_NODE_IP}:8000/v1
      - WEBUI_AUTH=true
    volumes:
      - open-webui:/app/backend/data
    extra_hosts:
      - "host.docker.internal:host-gateway"

volumes:
  open-webui:
EOF

echo ">>> Starting Docker Services..."
docker compose up -d

# 3. Setup Nginx & Certbot
echo ">>> Setting up Nginx Reverse Proxy..."
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx

# Basic Nginx Config
cat <<EOF > /etc/nginx/sites-available/${NGINX_SITE}
server {
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3002; 
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /chat {
        # Private Admin Chat at /chat
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Reconcile compose updates if this script is rerun.
docker compose up -d --force-recreate

# Enable Site
ln -sf /etc/nginx/sites-available/${NGINX_SITE} /etc/nginx/sites-enabled/${NGINX_SITE}
rm -f /etc/nginx/sites-enabled/default

# Reload Nginx
nginx -t
systemctl reload nginx

echo ">>> Setup Complete!"
echo "1. Open WebUI is running on Port 8080 (Mapped to /chat via Nginx)"
echo "2. Next.js App should be deployed to Port 3002"
echo "3. Run 'certbot --nginx -d $DOMAIN' to enable SSL"
