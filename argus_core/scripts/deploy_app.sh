#!/bin/bash
set -euo pipefail

# Load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node 20 if missing
if ! command -v node &> /dev/null; then
    echo "Installing Node 20..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 20
fi
nvm use 20

cd /opt/argus/app

echo ">>> Stopping existing application..."
if command -v pm2 &> /dev/null; then
    pm2 stop argus-app || true
    pm2 delete argus-app || true
fi

echo ">>> Cleaning previous install..."
rm -rf node_modules

echo ">>> Installing dependencies..."
npm ci

echo ">>> Creating .env.local..."
cat <<EOF > .env.local
AI_ENDPOINT="http://172.239.44.229:8000/v1/chat/completions"
NEXT_PUBLIC_APP_URL="https://argus.whiskeylabs.io"
EOF

echo ">>> Building application..."
npm run build

echo ">>> Starting PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

pm2 start npm --name "argus-app" -- run serve -- -p 3002
pm2 save

echo ">>> Application Deployed Successfully!"
