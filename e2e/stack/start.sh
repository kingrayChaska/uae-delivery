#!/usr/bin/env bash
# Starts the local stack in the background: PostgREST, Supabase Auth, the
# gateway, fake Mapbox and the SMTP sink (+ the built app with --with-app).
# Run setup-db.sh first for a fresh database.
set -euo pipefail
source "$(dirname "$0")/app-env.sh"
cd "$E2E_DIR/stack"
rm -rf "$E2E_LOGS/mail" && mkdir -p "$E2E_LOGS/mail"
PIDS="$E2E_LOGS/pids"
launch() { local log="$1"; shift; setsid "$@" > "$E2E_LOGS/$log" 2>&1 < /dev/null & echo $! >> "$PIDS"; }

cat > "$E2E_LOGS/postgrest.conf" << CONF
db-uri = "postgres://authenticator:$E2E_DB_PASSWORD@localhost:5432/$E2E_DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$E2E_JWT_SECRET"
server-host = "127.0.0.1"
server-port = $E2E_POSTGREST_PORT
CONF
launch postgrest.log "$E2E_BIN/postgrest" "$E2E_LOGS/postgrest.conf"

GW="http://127.0.0.1:$E2E_GATEWAY_PORT"
launch auth.log env GOTRUE_API_HOST=127.0.0.1 PORT=$E2E_AUTH_PORT GOTRUE_DB_DRIVER=postgres \
  DATABASE_URL="postgres://postgres:$E2E_DB_PASSWORD@localhost:5432/$E2E_DB?sslmode=disable&search_path=auth" \
  API_EXTERNAL_URL="http://localhost:$E2E_GATEWAY_PORT/auth/v1" GOTRUE_SITE_URL="$NEXT_PUBLIC_APP_URL" \
  GOTRUE_URI_ALLOW_LIST="$NEXT_PUBLIC_APP_URL/**" \
  GOTRUE_JWT_SECRET="$E2E_JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated \
  GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
  GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_PASSWORD_MIN_LENGTH=8 \
  GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=$E2E_SMTP_PORT GOTRUE_SMTP_ADMIN_EMAIL=noreply@wasla.test GOTRUE_SMTP_SENDER_NAME=Wasla \
  GOTRUE_MAILER_TEMPLATES_INVITE="$GW/__templates/invite.html" \
  GOTRUE_MAILER_TEMPLATES_RECOVERY="$GW/__templates/recovery.html" \
  GOTRUE_MAILER_TEMPLATES_CONFIRMATION="$GW/__templates/confirmation.html" \
  GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true \
  "$E2E_BIN/auth" serve

launch gateway.log node gateway.mjs
launch fake-mapbox.log node fake-mapbox.mjs
launch smtp.log python3 smtp-sink.py "$E2E_LOGS/mail" "$E2E_SMTP_PORT"
if [[ "${1:-}" == "--with-app" ]]; then
  [[ -f "$E2E_LOGS/tls.crt" ]] || openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=localhost" \
    -keyout "$E2E_LOGS/tls.key" -out "$E2E_LOGS/tls.crt" > /dev/null 2>&1
  launch tls-proxy.log node tls-proxy.mjs
  (cd "$E2E_DIR/.." && launch app.log npx next start -p "$E2E_APP_PORT")
fi

wait_for() {
  for _ in $(seq 1 60); do curl -s -o /dev/null "$2" && { echo "  ready: $1"; return 0; }; sleep 0.5; done
  echo "  NOT READY: $1 (see $E2E_LOGS)"; return 1
}
wait_for postgrest "http://127.0.0.1:$E2E_POSTGREST_PORT/"
wait_for auth "http://127.0.0.1:$E2E_AUTH_PORT/health"
wait_for gateway "$GW/auth/v1/health"
wait_for fake-mapbox "http://127.0.0.1:$E2E_MAPBOX_PORT/"
if [[ "${1:-}" == "--with-app" ]]; then
  wait_for app "http://localhost:$E2E_APP_PORT/login"
  for _ in $(seq 1 30); do curl -sk -o /dev/null "https://localhost:$E2E_TLS_PORT/login" && { echo "  ready: https proxy"; break; }; sleep 0.5; done
fi
