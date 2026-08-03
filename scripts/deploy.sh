#!/usr/bin/env bash
#
# Pull, install, restart, verify. Run on the VPS as the deploy user:
#
#   cd /var/www/indiaoffers-emystery && ./scripts/deploy.sh
#
# Backs up the database first, and rolls the service back if the new code
# fails its health check.

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/indiaoffers-emystery}"
SERVICE="${SERVICE:-mystery-indiaoffers}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3100/healthz}"

cd "$APP_DIR"

echo "▸ Backing up database…"
./scripts/backup-db.sh

echo "▸ Recording current revision…"
PREV=$(git rev-parse HEAD)
echo "  at $PREV"

echo "▸ Pulling latest…"
git pull --ff-only

echo "▸ Installing production dependencies…"
npm ci --omit=dev

echo "▸ Restarting $SERVICE…"
sudo systemctl restart "$SERVICE"

echo "▸ Waiting for health check…"
for i in $(seq 1 15); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "  healthy after ${i}s"
    echo
    curl -fsS "$HEALTH_URL"; echo
    echo "✅ Deploy complete."
    exit 0
  fi
  sleep 1
done

echo "✗ Health check failed. Rolling back to $PREV…" >&2
git reset --hard "$PREV"
npm ci --omit=dev
sudo systemctl restart "$SERVICE"
echo "  rolled back. Check: journalctl -u $SERVICE -n 50 --no-pager" >&2
exit 1
