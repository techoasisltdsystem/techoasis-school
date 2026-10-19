#!/usr/bin/env bash
# Publish the latest version of the site from GitHub (branch main). Run on the VPS:
#   sudo bash /var/www/techoasis-school/deploy/deploy.sh
# From your own computer in one step:
#   ssh -i ~/.ssh/oasis_vps root@SERVER_IP 'bash /var/www/techoasis-school/deploy/deploy.sh'
set -euo pipefail

DIR="/var/www/techoasis-school"
cd "$DIR"
before="$(git rev-parse --short HEAD)"
git fetch --quiet origin main
git reset --quiet --hard origin/main      # the server copy is deploy-only; it always matches GitHub exactly
chown -R www-data:www-data "$DIR"
# New code for the school server? Refresh its libraries and restart it (only if it has been set up with deploy/setup-app.sh)
if systemctl list-unit-files 2>/dev/null | grep -q '^techoasis-school'; then
    ( cd "$DIR/server" && PATH=/opt/techoasis/node/bin:$PATH npm ci --omit=dev --no-audit --no-fund --loglevel=error ) && systemctl restart techoasis-school && echo "School server restarted."
fi
after="$(git rev-parse --short HEAD)"

# The nginx site file is a server-side copy (certbot added HTTPS to it), so deploys never overwrite it.
# Only reload nginx so changes to the shared security-headers file take effect.
nginx -t -q && systemctl reload nginx

if [ "$before" = "$after" ]; then echo "Already up to date ($after)."; else echo "Deployed $before -> $after:"; git log --oneline "$before..$after" 2>/dev/null || true; fi
