# Shared settings for the local end-to-end stack. Test-only values — none of
# these are used by, or valid for, any real deployment.
export E2E_DB=uae_e2e
export E2E_DB_PASSWORD=e2e-local-only
export E2E_JWT_SECRET=e2e-local-only-jwt-secret-at-least-32-characters-long
export E2E_POSTGREST_PORT=3001
export E2E_AUTH_PORT=9999
export E2E_GATEWAY_PORT=54321
export E2E_MAPBOX_PORT=4010
export E2E_SMTP_PORT=2500
export E2E_APP_PORT=3100
export E2E_TLS_PORT=3443
export E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export E2E_BIN="$E2E_DIR/.bin"
export E2E_LOGS="$E2E_DIR/.logs"
mkdir -p "$E2E_LOGS"
