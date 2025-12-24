#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

DB_NAME="${DB_NAME:-packzen-db}"
EXTRA_ARGS=("$@")

if [[ -n "${WRANGLER_BIN:-}" ]]; then
  WRANGLER="$WRANGLER_BIN"
elif [[ -x "node_modules/.bin/wrangler" ]]; then
  WRANGLER="node_modules/.bin/wrangler"
else
  WRANGLER="wrangler"
fi

if ! command -v "$WRANGLER" >/dev/null 2>&1; then
  printf 'Error: wrangler CLI not found. Install it or set WRANGLER_BIN.\\n' >&2
  exit 1
fi

echo "Total users (distinct clerk_user_id found in trips):"
"$WRANGLER" d1 execute "$DB_NAME" "${EXTRA_ARGS[@]}" --command "SELECT COUNT(DISTINCT clerk_user_id) AS user_count FROM trips;"
echo

echo "Trips per user:"
"$WRANGLER" d1 execute "$DB_NAME" "${EXTRA_ARGS[@]}" --command "SELECT clerk_user_id, COUNT(*) AS trip_count FROM trips GROUP BY clerk_user_id ORDER BY trip_count DESC;"
