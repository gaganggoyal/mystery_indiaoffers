#!/usr/bin/env bash
#
# First-run setup for mystery.indiaoffers.in on a fresh VPS.
#
#   ./scripts/setup-production.sh
#
# Creates .env from the production template with a generated JWT_SECRET,
# migrates any publicly-exposed payment proofs, and tells you exactly what
# is still missing. Safe to re-run — it never overwrites an existing .env.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

DOMAIN="${DOMAIN:-mystery.indiaoffers.in}"
ENV_FILE=".env"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }

bold "Setting up $DOMAIN"
echo

# ── 1. .env ────────────────────────────────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  ok ".env already exists — leaving it alone"
else
  cp deploy/production.env.example "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  SECRET=$(openssl rand -hex 32)
  # Portable in-place edit (BSD and GNU sed disagree on -i).
  sed "s|^JWT_SECRET=.*|JWT_SECRET=$SECRET|" "$ENV_FILE" > "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok "created .env from deploy/production.env.example (chmod 600)"
  ok "generated a 64-char JWT_SECRET"
fi

# ── 2. Directories ─────────────────────────────────────────────────────────
mkdir -p data/uploads data/backups
ok "data/uploads and data/backups ready"

# ── 3. Migrate publicly-exposed payment proofs ─────────────────────────────
echo
bold "Checking for publicly-exposed payment proofs"
node scripts/migrate-uploads.js --apply

# ── 4. Report what's still missing ─────────────────────────────────────────
echo
bold "Remaining configuration"

missing=0
need() {
  local key="$1" why="$2"
  local val
  val=$(grep -E "^$key=" "$ENV_FILE" | head -1 | cut -d= -f2- || true)
  if [[ -z "$val" ]]; then
    warn "$key is empty — $why"
    missing=$((missing+1))
  else
    ok "$key is set"
  fi
}

need JWT_SECRET "the app will not start"
need MYSTERY_UPI_ID "clients would see a placeholder UPI ID and pay nobody"
need SMTP_HOST "clients would never receive pay links, confirmations or reports"

echo
if [[ "$missing" -gt 0 ]]; then
  bold "Edit .env and fill in the $missing item(s) above:"
  echo "  nano .env"
  echo
fi

bold "Then — first admin and the service:"
cat <<EOF
  node scripts/admin.js create you@indiaoffers.in
  sudo cp deploy/emystery.service /etc/systemd/system/
  sudo systemctl daemon-reload && sudo systemctl enable --now emystery
  sudo ufw allow from 172.16.0.0/12 to any port 3100 proto tcp comment 'emystery app'
EOF

echo
bold "Then — put it behind a reverse proxy (pick the one this box uses):"
cat <<EOF
  Caddy in Docker (as on the IndiaOffers VPS) — see deploy/Caddyfile.snippet:
    append the block to the shared Caddyfile, then
    docker exec <caddy> caddy validate --config /etc/caddy/Caddyfile
    docker exec <caddy> caddy reload   --config /etc/caddy/Caddyfile

  Standalone nginx — see deploy/nginx-$DOMAIN.conf:
    sudo cp deploy/nginx-$DOMAIN.conf /etc/nginx/sites-available/$DOMAIN
    sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx
    sudo certbot --nginx -d $DOMAIN
EOF

echo
bold "Verify:"
cat <<EOF
  curl https://$DOMAIN/healthz
  BASE=https://$DOMAIN ./scripts/smoke-test.sh

Nightly backups:
  echo "0 2 * * * cd \$PWD && ./scripts/backup-db.sh >> \$PWD/data/backup.log 2>&1" | crontab -
EOF
