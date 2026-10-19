#!/usr/bin/env bash
# Creates the school's own PostgreSQL database on the VPS. Run once as root:
#   curl -fsSL https://raw.githubusercontent.com/techoasisltdsystem/techoasis-school/main/deploy/setup-database.sh | sudo bash
#
# What it does (and only this):
#   1. Installs PostgreSQL if the server has none. If PostgreSQL is already running for your other sites, it is used as it is.
#   2. Creates a separate database "techoasis_school" with its own user. Other databases and users are never read or changed.
#   3. Saves the connection details (including a random password) in /etc/techoasis/school.env, readable by root only.
#      The password is not printed on screen.
#   4. Sets up a nightly backup in /var/backups/techoasis-school (kept for 14 days).
# Safe to run again: it keeps the existing password and data.
set -euo pipefail

DB="techoasis_school"
ROLE="techoasis_school"
ENV_DIR="/etc/techoasis"
ENV_FILE="$ENV_DIR/school.env"
BACKUP_DIR="/var/backups/techoasis-school"
BACKUP_BIN="/usr/local/sbin/techoasis-school-backup"

[ "$(id -u)" = 0 ] || { echo "Please run this as root (use sudo)."; exit 1; }
as_pg() { runuser -u postgres -- "$@"; }

echo "==> Looking for PostgreSQL"
if ! systemctl cat postgresql.service >/dev/null 2>&1; then
    echo "    Not installed on this server. Installing PostgreSQL (your other sites are not affected)..."
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib >/dev/null
else
    echo "    PostgreSQL is already on this server. It will be used as it is."
fi
systemctl enable --now postgresql >/dev/null 2>&1 || true
for _ in $(seq 1 30); do as_pg psql -tAc "select 1" >/dev/null 2>&1 && break; sleep 1; done
as_pg psql -tAc "select 1" >/dev/null 2>&1 || { echo "PostgreSQL is not answering. Check: systemctl status postgresql"; exit 1; }

PORT="$(as_pg psql -tAc 'show port')"
VERSION="$(as_pg psql -tAc 'show server_version' | cut -d' ' -f1)"
LISTEN="$(as_pg psql -tAc 'show listen_addresses')"
echo "    PostgreSQL $VERSION on port $PORT"

echo "==> Creating the school's own database and user"
mkdir -p "$ENV_DIR"; chmod 700 "$ENV_DIR"
PASS=""
if [ -f "$ENV_FILE" ] && grep -q '^DATABASE_URL=' "$ENV_FILE"; then
    PASS="$(sed -n "s#^DATABASE_URL=postgres://[^:]*:\([^@]*\)@.*#\1#p" "$ENV_FILE" | head -1)"
fi
[ -n "$PASS" ] || PASS="$(openssl rand -hex 24)"      # letters and digits only, so it is safe inside the connection address

as_pg psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$ROLE') THEN
    CREATE ROLE $ROLE LOGIN PASSWORD '$PASS';
  ELSE
    ALTER ROLE $ROLE WITH LOGIN PASSWORD '$PASS';
  END IF;
END
\$\$;
SQL
if [ "$(as_pg psql -tAc "select 1 from pg_database where datname = '$DB'")" != "1" ]; then
    as_pg createdb -O "$ROLE" -E UTF8 "$DB"
fi
as_pg psql -v ON_ERROR_STOP=1 -q -d "$DB" -c "REVOKE ALL ON DATABASE $DB FROM PUBLIC; GRANT ALL ON DATABASE $DB TO $ROLE; ALTER SCHEMA public OWNER TO $ROLE;"

echo "==> Saving the connection details (root-only file: $ENV_FILE)"
touch "$ENV_FILE"; chmod 600 "$ENV_FILE"
sed -i '/^DATABASE_URL=/d' "$ENV_FILE"
grep -q '^NODE_ENV=' "$ENV_FILE" || echo "NODE_ENV=production" >> "$ENV_FILE"
grep -q '^PORT=' "$ENV_FILE" || echo "PORT=3001" >> "$ENV_FILE"
grep -q '^SITE_URL=' "$ENV_FILE" || echo "SITE_URL=https://school.techoasisltd.com" >> "$ENV_FILE"
echo "DATABASE_URL=postgres://$ROLE:$PASS@127.0.0.1:$PORT/$DB" >> "$ENV_FILE"

echo "==> Testing the connection as the school's user"
if PGPASSWORD="$PASS" psql -h 127.0.0.1 -p "$PORT" -U "$ROLE" -d "$DB" -tAc "select 'connected to ' || current_database() || ' as ' || current_user" ; then :
else
    echo "    The school's user could not connect over 127.0.0.1:$PORT. Check pg_hba.conf allows password logins from 127.0.0.1."
    exit 1
fi

echo "==> Nightly backup"
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
cat > "$BACKUP_BIN" <<'EOF'
#!/usr/bin/env bash
# Nightly backup of the school's database. Keeps 14 days.
set -euo pipefail
OUT="/var/backups/techoasis-school"
mkdir -p "$OUT"
f="$OUT/school-$(date +%F-%H%M).dump"
runuser -u postgres -- pg_dump -Fc techoasis_school > "$f"
chmod 600 "$f"
find "$OUT" -name 'school-*.dump' -mtime +14 -delete
echo "$f"
EOF
chmod 700 "$BACKUP_BIN"
echo "17 2 * * * root $BACKUP_BIN >/dev/null 2>&1" > /etc/cron.d/techoasis-school-backup
chmod 644 /etc/cron.d/techoasis-school-backup
test_backup="$("$BACKUP_BIN")" && echo "    First backup written: $test_backup ($(du -h "$test_backup" | cut -f1))"

echo
echo "==> Done. Summary"
echo "    Database : $DB (own user '$ROLE'), PostgreSQL $VERSION, port $PORT"
echo "    Listens  : $LISTEN"
case "$LISTEN" in *'*'*|*0.0.0.0*) echo "    NOTE: this PostgreSQL accepts connections from the internet. If your other apps do not need that, ask for help locking it down.";; esac
echo "    Settings : $ENV_FILE (root only)"
echo "    Backups  : $BACKUP_DIR every night at 02:17, kept 14 days"
echo "    Other databases on this server: not touched."
