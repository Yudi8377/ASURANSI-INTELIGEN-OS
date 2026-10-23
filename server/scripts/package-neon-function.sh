#!/usr/bin/env bash
set -euo pipefail

# Build and smoke-test a Neon Functions archive using the target linux/arm64
# Node 24 runtime. No production credentials are used by this script.
rm -rf build/neon-function build/asuransiapi.zip
mkdir -p build/neon-function/server

docker run --rm --platform linux/arm64 \
  -e DATABASE_URL='postgresql://ci:ci@127.0.0.1:5432/ci' \
  -e AUTH_ACCESS_TOKEN_SECRET='ci-only-placeholder-secret-not-for-deployment' \
  -e APP_ORIGIN='https://example.invalid' \
  -e NEON_FUNCTION_RUNTIME='1' \
  -e NODE_ENV='production' \
  -v "$PWD:/workspace" -w /workspace node:24-bookworm bash -lc '
    set -euo pipefail
    npm install --prefix server --omit=dev --no-audit --no-fund
    # Prune while still inside the container: npm creates root-owned files
    # on the mounted workspace, which cannot reliably be removed by the runner.
    find server/node_modules -type d \\( \
      -name test -o -name tests -o -name __tests__ -o -name examples -o \
      -name docs -o -name coverage \\) -prune -exec rm -rf {} +
    find server/node_modules -type f \\( -name '*.map' -o -name '*.md' -o -name '*.markdown' \\) -delete
    node server/scripts/neon-package-smoke.mjs
  '

# Non-runtime files are pruned inside the container above to avoid
# permission errors on root-owned files in the mounted workspace.
cp -R server/src build/neon-function/server/src
cp -R server/node_modules build/neon-function/server/node_modules
cp server/package.json build/neon-function/server/package.json
printf '%s\n' "export { default } from './server/src/neon-function.mjs';" > build/neon-function/index.mjs

# Neon Functions archive limits: 32 MiB compressed and 128 MiB extracted.
extracted_bytes="$(du -sb build/neon-function | cut -f1)"
test "$extracted_bytes" -le 134217728
(
  cd build/neon-function
  zip -qr ../asuransiapi.zip .
)
compressed_bytes="$(stat -c '%s' build/asuransiapi.zip)"
entry_count="$(find build/neon-function -type f | wc -l | tr -d ' ')"
test "$compressed_bytes" -le 33554432
printf 'Created build/asuransiapi.zip (%s compressed bytes, %s extracted bytes, %s files)\n' "$compressed_bytes" "$extracted_bytes" "$entry_count"
