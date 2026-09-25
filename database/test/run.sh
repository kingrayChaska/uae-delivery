#!/usr/bin/env bash
# Applies every migration to a scratch local Postgres database and runs a
# battery of RLS attack/legitimate-path checks. This is NOT part of the
# Supabase deployment — it exists so schema/RLS changes can be verified
# without a live Supabase project. Requires a local Postgres with a
# postgres superuser (apt install postgresql; service postgresql start).
#
# Usage: bash database/test/run.sh

set -euo pipefail
cd "$(dirname "$0")/../.."

DB=uae_delivery_test

su postgres -c "dropdb --if-exists $DB"
su postgres -c "createdb $DB"

su postgres -c "psql -d $DB -v ON_ERROR_STOP=1 -f $(pwd)/database/test/0000_supabase_stub.sql" > /dev/null
su postgres -c "psql -d $DB -v ON_ERROR_STOP=1 -f $(pwd)/database/test/0000b_storage_stub.sql" > /dev/null
su postgres -c "psql -d $DB -c \"
  DO \\\$\\\$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
  END \\\$\\\$;
  grant usage on schema public to anon, authenticated, service_role;
\"" > /dev/null

for f in database/migrations/*.sql; do
  echo "Applying $f"
  su postgres -c "psql -d $DB -v ON_ERROR_STOP=1 -f $(pwd)/$f"
done

su postgres -c "psql -d $DB -v ON_ERROR_STOP=1 -f $(pwd)/database/seed/0001_default_pricing_rule.sql" > /dev/null

# Supabase grants table/sequence access to anon/authenticated by default;
# plain local Postgres doesn't, so replicate that here for the test only —
# do NOT add these grants to the real migrations.
su postgres -c "psql -d $DB -c \"
  grant select, insert, update on all tables in schema public to authenticated;
  alter default privileges in schema public grant select, insert, update on tables to authenticated;
  grant usage on all sequences in schema public to authenticated;
  alter default privileges in schema public grant usage on sequences to authenticated;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema storage to authenticated;
  grant select, insert, update on all tables in schema storage to authenticated;
\"" > /dev/null

echo "Migrations applied cleanly to a scratch database. Run database/test/attacks.sql for the RLS test battery."
