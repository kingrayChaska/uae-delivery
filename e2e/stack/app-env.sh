# Environment for building/running the app against the local stack.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
export NEXT_PUBLIC_SUPABASE_URL="http://localhost:$E2E_GATEWAY_PORT"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$(E2E_JWT_SECRET=$E2E_JWT_SECRET node "$E2E_DIR/stack/jwt.mjs" anon)"
export SUPABASE_SERVICE_ROLE_KEY="$(E2E_JWT_SECRET=$E2E_JWT_SECRET node "$E2E_DIR/stack/jwt.mjs" service_role)"
export NEXT_PUBLIC_APP_URL="https://localhost:$E2E_TLS_PORT"
export NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="e2e-fake-browser-key"
export GOOGLE_MAPS_SERVER_API_KEY="e2e-fake-server-key"
export GOOGLE_MAPS_API_URL="http://127.0.0.1:$E2E_GOOGLE_MAPS_PORT"
export TURNSTILE_DISABLED=true
