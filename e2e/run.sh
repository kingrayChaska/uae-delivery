#!/usr/bin/env bash
# One command: fresh database, stack up, production build of the app wired
# to the stack, then the Playwright suite. Usage: bash e2e/run.sh [playwright args]
set -euo pipefail
cd "$(dirname "$0")/.."
source e2e/stack/app-env.sh
[[ -x e2e/.bin/auth && -x e2e/.bin/postgrest ]] || bash e2e/stack/install.sh
bash e2e/stack/stop.sh
trap 'bash e2e/stack/stop.sh' EXIT
service postgresql start > /dev/null 2>&1 || true
bash e2e/stack/setup-db.sh 2> "$E2E_LOGS/setup-db.log" | tail -1 || { cat "$E2E_LOGS/setup-db.log"; exit 1; }
if [[ -z "${E2E_SKIP_BUILD:-}" ]]; then npx next build > "$E2E_LOGS/build.log" 2>&1 || { tail -30 "$E2E_LOGS/build.log"; exit 1; }; fi
bash e2e/stack/start.sh --with-app
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
npx playwright test -c e2e/playwright.config.ts "$@"
