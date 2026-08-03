#!/usr/bin/env bash
#
# Consistent SQLite backup (safe while the app is running — uses the online
# backup API via `sqlite3 .backup`, not a file copy, so WAL state is included).
#
#   ./scripts/backup-db.sh
#
# Cron it daily:
#   0 2 * * * cd /var/www/indiaoffers-emystery && ./scripts/backup-db.sh >> /var/log/emystery-backup.log 2>&1

set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DB="${DB:-$APP_DIR/data/emystery.db}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/data/backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"

if [[ ! -f "$DB" ]]; then
  echo "No database at $DB — nothing to back up."
  exit 0
fi

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/emystery-$STAMP.db"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB" ".backup '$OUT'"
else
  # Fallback: better-sqlite3 ships its own engine, so no sqlite3 CLI needed.
  node -e "
    const Database = require('$APP_DIR/node_modules/better-sqlite3');
    const db = new Database('$DB', { readonly: true });
    db.backup('$OUT').then(() => { db.close(); }).catch(e => { console.error(e); process.exit(1); });
  "
fi

gzip -f "$OUT"
echo "✓ Backed up to $OUT.gz ($(du -h "$OUT.gz" | cut -f1))"

# Payment proofs live outside the DB — archive them alongside it.
if [[ -d "$APP_DIR/data/uploads" ]] && [[ -n "$(ls -A "$APP_DIR/data/uploads" 2>/dev/null)" ]]; then
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$APP_DIR/data" uploads
  echo "✓ Archived payment proofs to $BACKUP_DIR/uploads-$STAMP.tar.gz"
fi

find "$BACKUP_DIR" -name '*.gz' -type f -mtime "+$KEEP_DAYS" -delete
echo "✓ Pruned backups older than $KEEP_DAYS days."
