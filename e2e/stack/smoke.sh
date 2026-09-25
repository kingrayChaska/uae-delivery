#!/usr/bin/env bash
# Quick sanity check of the running stack (not the app): real sign-up, RLS,
# anonymous reads, and that privileged functions are locked down.
set -uo pipefail
source "$(dirname "$0")/app-env.sh"
GW="http://localhost:$E2E_GATEWAY_PORT"
ANON=(-H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY")
j() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }

echo "1. sign up through the real Auth server:"
curl -s -X POST "$GW/auth/v1/signup" "${ANON[@]}" -H 'content-type: application/json' \
  -d '{"email":"smoke@test.ae","password":"Passw0rd!","data":{"full_name":"Smoke Test","phone":"0501234567"}}' | j "'   session issued:', bool(d.get('access_token'))"
TOKEN=$(curl -s -X POST "$GW/auth/v1/token?grant_type=password" "${ANON[@]}" -H 'content-type: application/json' \
  -d '{"email":"smoke@test.ae","password":"Passw0rd!"}' | j "d['access_token']")
AUTH=(-H "Authorization: Bearer $TOKEN")
echo "2. own profile via PostgREST + RLS (created by the signup trigger):"
curl -s "$GW/rest/v1/profiles?select=email,role,full_name" "${ANON[@]}" "${AUTH[@]}" | sed 's/^/   /'; echo
echo "3. can this customer see any other profile? (expect 1 = only their own)"
curl -s "$GW/rest/v1/profiles?select=id" "${ANON[@]}" "${AUTH[@]}" | j "'   visible profiles:', len(d)"
echo "4. active pricing rule, anonymously:"
curl -s "$GW/rest/v1/pricing_rules?select=name,base_price&is_active=eq.true" "${ANON[@]}" | sed 's/^/   /'; echo
echo "5. customer calls notify_operators via the REST API (expect permission denied):"
curl -s -X POST "$GW/rest/v1/rpc/notify_operators" "${ANON[@]}" "${AUTH[@]}" -H 'content-type: application/json' \
  -d '{"p_type":"x","p_title":"phish","p_body":"evil"}' | j "'   ', d.get('code'), d.get('message')"
echo "6. customer tries to promote themselves to manager via the REST API (expect blocked):"
curl -s -X PATCH "$GW/rest/v1/profiles?email=eq.smoke@test.ae" "${ANON[@]}" "${AUTH[@]}" -H 'content-type: application/json' \
  -d '{"role":"manager"}' | j "'   ', d.get('code'), d.get('message')"
