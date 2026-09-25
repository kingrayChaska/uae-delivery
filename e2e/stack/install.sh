#!/usr/bin/env bash
# Downloads the pinned Supabase Auth and PostgREST binaries (Linux x86-64)
# into e2e/.bin. Versions are pinned so the suite tests against a known
# server build; bump them deliberately.
set -euo pipefail
AUTH_VERSION=v2.197.0
POSTGREST_VERSION=v16.4
BIN="$(cd "$(dirname "$0")/.." && pwd)/.bin"
mkdir -p "$BIN" && cd "$BIN"
curl -fsSL -o auth.tar.gz "https://github.com/supabase/auth/releases/download/$AUTH_VERSION/auth-$AUTH_VERSION-x86.tar.gz"
curl -fsSL -o postgrest.tar.xz "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x86-64.tar.xz"
tar -xzf auth.tar.gz && tar -xJf postgrest.tar.xz && rm -f auth.tar.gz postgrest.tar.xz
echo "Installed: $(./postgrest --version | head -1), Supabase Auth $AUTH_VERSION"
