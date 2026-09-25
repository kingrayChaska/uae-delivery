#!/usr/bin/env bash
# Builds a fresh database laid out like a real Supabase project, then applies
# this app's migrations and seed on top.
set -euo pipefail
source "$(dirname "$0")/env.sh"
ROOT="$(cd "$E2E_DIR/.." && pwd)"
PSQL="psql -v ON_ERROR_STOP=1 -q"

su postgres -c "psql -q -c \"alter user postgres password '$E2E_DB_PASSWORD';\"" >/dev/null
su postgres -c "dropdb --if-exists --force $E2E_DB" && su postgres -c "createdb $E2E_DB"

# 1. Supabase's standard roles and default privileges, created BEFORE any
#    migration — so the app's own revocations (e.g. migration 0018) are
#    exercised against the same defaults a real project starts with.
su postgres -c "$PSQL -d $E2E_DB" << SQL
do \$\$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
end \$\$;
alter role service_role bypassrls;
alter role authenticator password '$E2E_DB_PASSWORD';
grant anon, authenticated, service_role to authenticator;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create extension if not exists pgcrypto;
create publication supabase_realtime;
SQL

# 2. Supabase Auth creates and migrates the auth schema itself.
su postgres -c "$PSQL -d $E2E_DB -c 'create schema if not exists auth;'"
GOTRUE_DB_DRIVER=postgres \
DATABASE_URL="postgres://postgres:$E2E_DB_PASSWORD@localhost:5432/$E2E_DB?sslmode=disable&search_path=auth" \
GOTRUE_DB_MIGRATIONS_PATH="$E2E_BIN/migrations" \
GOTRUE_JWT_SECRET="$E2E_JWT_SECRET" GOTRUE_SITE_URL="http://localhost:$E2E_APP_PORT" API_EXTERNAL_URL="http://localhost:$E2E_GATEWAY_PORT/auth/v1" \
  "$E2E_BIN/auth" migrate > "$E2E_LOGS/auth-migrate.log" 2>&1
su postgres -c "$PSQL -d $E2E_DB" << SQL
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
SQL

# 3. Storage isn't part of this stack; its schema stub lets migrations that
#    configure buckets apply cleanly.
su postgres -c "$PSQL -d $E2E_DB -f $ROOT/database/test/0000b_storage_stub.sql"

# 4. The app's migrations and seed, exactly as deployed.
for migration in "$ROOT"/database/migrations/*.sql; do
  su postgres -c "$PSQL -d $E2E_DB -f $migration" || { echo "FAILED: $migration"; exit 1; }
done
su postgres -c "$PSQL -d $E2E_DB -f $ROOT/database/seed/0001_default_pricing_rule.sql"
echo "e2e database ready: $(ls "$ROOT"/database/migrations/*.sql | wc -l) migrations applied"
