#!/usr/bin/env bash
# Starts the school's server on the VPS. Run once as root, AFTER deploy/setup-database.sh:
#   curl -fsSL https://raw.githubusercontent.com/techoasisltdsystem/techoasis-school/main/deploy/setup-app.sh | sudo bash
#
# What it does, in order. Nothing here touches your other sites:
#   1. Gets the latest code from GitHub into /var/www/techoasis-school.
#   2. Installs its OWN copy of Node.js in /opt/techoasis/node (the system's Node, if any, is left alone).
#   3. Installs the server's two libraries and runs the security tests against a throwaway database in your real PostgreSQL.
#      If any test fails, it stops and nothing goes live.
#   4. Creates a locked-down service ("techoasis-school") that restarts itself and is limited to 700 MB of memory.
#   5. Adds /api/ to the school's nginx site (backing the file up first, and undoing the change if nginx rejects it).
# Safe to run again; it is also how you update the server after new code is pushed.
set -euo pipefail

DIR="/var/www/techoasis-school"
REPO="${REPO:-https://github.com/techoasisltdsystem/techoasis-school.git}"
NODE_DIR="/opt/techoasis/node"
ENV_FILE="/etc/techoasis/school.env"
CONF="/etc/nginx/sites-available/school.techoasisltd.com.conf"
SNIP="/etc/nginx/snippets/techoasis-school-api.conf"
UNIT="/etc/systemd/system/techoasis-school.service"
CLI="/usr/local/sbin/techoasis-school-cli"
SVC_USER="techoasis"

[ "$(id -u)" = 0 ] || { echo "Please run this as root (use sudo)."; exit 1; }
[ -f "$ENV_FILE" ] && grep -q '^DATABASE_URL=' "$ENV_FILE" || { echo "The database is not set up yet. Run deploy/setup-database.sh first."; exit 1; }
[ -f "$CONF" ] || { echo "The school's nginx site was not found at $CONF. Run deploy/setup-server.sh first."; exit 1; }
as_pg() { runuser -u postgres -- "$@"; }

echo "==> 1/5 Getting the latest code"
if [ -d "$DIR/.git" ]; then
    git -C "$DIR" fetch --quiet origin main && git -C "$DIR" reset --quiet --hard origin/main
else
    git clone --quiet --depth 1 --branch main "$REPO" "$DIR"
fi
git config --global --add safe.directory "$DIR"
[ -f "$DIR/server/package.json" ] || { echo "The server code is not in the repository yet (server/package.json missing)."; exit 1; }

echo "==> 2/5 Node.js (a private copy for the school only)"
if [ ! -x "$NODE_DIR/bin/node" ] || [ "$("$NODE_DIR/bin/node" -v | cut -c1-4)" != "v22." ]; then
    case "$(uname -m)" in x86_64) ARCH=linux-x64;; aarch64|arm64) ARCH=linux-arm64;; *) echo "Unsupported CPU: $(uname -m)"; exit 1;; esac
    command -v xz >/dev/null || { apt-get update -qq; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq xz-utils >/dev/null; }
    base="https://nodejs.org/dist/latest-v22.x"
    sums="$(curl -fsSL "$base/SHASUMS256.txt")"
    file="$(echo "$sums" | awk -v a="$ARCH" '$2 ~ a"\\.tar\\.xz$" {print $2}')"
    want="$(echo "$sums" | awk -v f="$file" '$2==f {print $1}')"
    tmp="$(mktemp -d)"; curl -fsSL "$base/$file" -o "$tmp/$file"
    got="$(sha256sum "$tmp/$file" | cut -d' ' -f1)"
    [ -n "$want" ] && [ "$want" = "$got" ] || { echo "The Node.js download did not match its official checksum. Stopping."; rm -rf "$tmp"; exit 1; }
    rm -rf "$NODE_DIR"; mkdir -p "$NODE_DIR"; tar -xJf "$tmp/$file" -C "$NODE_DIR" --strip-components=1; rm -rf "$tmp"
fi
export PATH="$NODE_DIR/bin:$PATH"
echo "    Node $(node -v) in $NODE_DIR"

echo "==> 3/5 Installing libraries and running the security tests on your real PostgreSQL"
id "$SVC_USER" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$SVC_USER"
( cd "$DIR/server" && npm ci --omit=dev --no-audit --no-fund --loglevel=error )
set -a; . "$ENV_FILE"; set +a
if [ "${SKIP_TESTS:-0}" != "1" ]; then
    PASS="$(echo "$DATABASE_URL" | sed -n 's#^postgres://[^:]*:\([^@]*\)@.*#\1#p')"
    PGPORT="$(echo "$DATABASE_URL" | sed -n 's#.*:\([0-9]*\)/[^/]*$#\1#p')"
    as_pg dropdb --if-exists techoasis_school_test
    as_pg createdb -O techoasis_school techoasis_school_test
    TESTURL="postgres://techoasis_school:$PASS@127.0.0.1:$PGPORT/techoasis_school_test"
    if ( cd "$DIR/server" && runuser -u "$SVC_USER" -- env TEST_DATABASE_URL="$TESTURL" NODE_ENV=test "$NODE_DIR/bin/node" test/run.js ); then
        as_pg dropdb techoasis_school_test
    else
        as_pg dropdb --if-exists techoasis_school_test
        echo "The security tests FAILED on this server. Nothing was started. Please send the output above."
        exit 1
    fi
fi

echo "==> 4/5 Service"
PORT="${PORT:-3001}"
if [ -n "$(ss -ltnH "sport = :$PORT" 2>/dev/null)" ] && ! systemctl is-active --quiet techoasis-school; then
    for p in $(seq 3101 3199); do [ -z "$(ss -ltnH "sport = :$p" 2>/dev/null)" ] && { PORT=$p; break; }; done
    echo "    Port 3001 is used by something else; the school server will use $PORT"
fi
sed -i '/^PORT=/d' "$ENV_FILE"; echo "PORT=$PORT" >> "$ENV_FILE"
cp "$DIR/deploy/techoasis-school.service" "$UNIT"
cat > "$CLI" <<EOF
#!/usr/bin/env bash
# Administration commands for the school server (create-admin, seed-catalog, backup, stats). Example: techoasis-school-cli create-admin
set -a; . $ENV_FILE; set +a
runuser -u $SVC_USER -- $NODE_DIR/bin/node $DIR/server/src/cli.js "\$@"
status=\$?
# These commands write to the database directly, and the running server keeps its own copy in memory: restart it to pick the change up
case "\${1:-}" in
    create-admin|seed-catalog|seed-demo) if [ \$status -eq 0 ]; then systemctl restart techoasis-school && echo "School server restarted to pick up the change."; fi ;;
esac
exit \$status
EOF
chmod 700 "$CLI"
systemctl daemon-reload
systemctl enable techoasis-school >/dev/null 2>&1
systemctl restart techoasis-school
for _ in $(seq 1 40); do curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 || { echo "The server did not start. See: journalctl -u techoasis-school -n 40"; exit 1; }
echo "    Running on 127.0.0.1:$PORT (only this machine can reach it)"

echo "==> 5/5 Connecting it to the website (nginx /api/)"
mkdir -p /etc/nginx/snippets
sed "s#127.0.0.1:3001#127.0.0.1:$PORT#" "$DIR/deploy/nginx/api-proxy.conf" > "$SNIP"
if ! grep -q 'techoasis-school-api.conf' "$CONF"; then
    BACKUP="$CONF.bak-$(date +%s)"; cp "$CONF" "$BACKUP"
    target="$(awk '
        function cnt(s, ch,  n, i) { n = 0; for (i = 1; i <= length(s); i++) if (substr(s, i, 1) == ch) n++; return n }
        { line = $0; sub(/#.*/, "", line)
          if (depth == 0 && line ~ /^[ \t]*server[ \t]*\{/) { has443 = 0; sn = 0 }
          if (depth >= 1) { if (line ~ /listen[ \t]+(\[::\]:)?443/) has443 = 1; if (sn == 0 && line ~ /^[ \t]*server_name[ \t]/) sn = NR }
          depth += cnt(line, "{") - cnt(line, "}")
          if (depth == 0 && sn > 0) { if (first == 0) first = sn; if (has443 && h == 0) h = sn; sn = 0 } }
        END { print (h ? h : first) }' "$CONF")"
    [ -n "$target" ] && [ "$target" -gt 0 ] || { echo "Could not find the server block in $CONF"; exit 1; }
    sed -i "${target}a\\    include $SNIP;" "$CONF"
    if ! nginx -t >/dev/null 2>&1; then
        cp "$BACKUP" "$CONF"; echo "nginx rejected the change, so it was undone. Details:"; nginx -t 2>&1 | tail -5; exit 1
    fi
fi
nginx -t >/dev/null 2>&1 && systemctl reload nginx
sleep 1
via_nginx="$(curl -ksS --max-time 10 --resolve school.techoasisltd.com:443:127.0.0.1 https://school.techoasisltd.com/api/health || true)"

echo
echo "==> Done. Summary"
echo "    Service  : techoasis-school ($(systemctl is-active techoasis-school)), restarts by itself, memory limit 700 MB"
echo "    Address  : http://127.0.0.1:$PORT (not reachable from the internet)"
echo "    Website  : https://school.techoasisltd.com/api/health -> ${via_nginx:-no answer yet}"
echo "    Logs     : journalctl -u techoasis-school -f"
echo "    Next     : create your administrator:   sudo techoasis-school-cli create-admin"
