#!/bin/bash
# scripts/migrate_to_argus.sh

echo ">>> 🚀 Starting Alatheia -> Argus Migration..."

# 1. Stop old service
echo "Stopping old PM2 process..."
pm2 stop alatheia-app || true
pm2 delete alatheia-app || true

# 2. Key Migration (Rename Directory)
if [ -d "/opt/alatheia" ] && [ ! -d "/opt/argus" ]; then
    echo "Renaming /opt/alatheia to /opt/argus..."
    mv /opt/alatheia /opt/argus
elif [ -d "/opt/argus" ]; then
    echo "/opt/argus already exists. Skipping rename."
else
    echo "Warning: /opt/alatheia not found. Creating /opt/argus..."
    mkdir -p /opt/argus/app
fi

# 3. Update Nginx
echo "Updating Nginx config..."
# Parse existing config and replace domain
if grep -q "alatheia.whiskeylabs.io" /etc/nginx/sites-available/default; then
    sed -i 's/alatheia.whiskeylabs.io/argus.whiskeylabs.io/g' /etc/nginx/sites-available/default
    systemctl reload nginx
    echo "Nginx updated and reloaded."
else
    echo "Nginx config does not contain 'alatheia.whiskeylabs.io'. Please check manually."
fi

echo ">>> ✅ Migration Part 1 Complete (Infrastructure)."
echo "---------------------------------------------------"
echo "NEXT STEPS (Run from Local Machine):"
echo "1. Upload code: rsync -avz --exclude 'node_modules' --exclude '.next' ./ root@198.74.62.215:/opt/argus/app"
echo "2. SSH in and Build:"
echo "   cd /opt/argus/app"
echo "   npm ci"
echo "   npm run build"
echo "   pm2 start npm --name 'argus-app' -- start -- -p 3000"
echo "   pm2 save"
