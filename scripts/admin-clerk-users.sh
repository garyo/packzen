#!/usr/bin/env bash

set -euo pipefail

API_KEY="${CLERK_SECRET_KEY:-}"

if [[ -z "$API_KEY" ]]; then
  echo "CLERK_SECRET_KEY env var is required (export it from your .env file)" >&2
  exit 1
fi

BASE_URL="https://api.clerk.com/v1"
PAGE=1
PAGE_SIZE=100
TOTAL=0
HEADER_PRINTED=false

while true; do
  RESPONSE=$(curl -sS \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    "$BASE_URL/users?limit=$PAGE_SIZE&page=$PAGE")

  TRIMMED=$(echo "$RESPONSE" | sed -e 's/^[[:space:]]*//')
  if [[ "$TRIMMED" == \[* ]]; then
    USERS="$TRIMMED"
  else
    USERS=$(echo "$RESPONSE" | jq -c '.data // empty')
  fi
  if [[ -z "$USERS" || "$USERS" == "null" ]]; then
    ERROR_MSG=$(echo "$RESPONSE" | jq -r '.errors?[0]?.message // empty')
    echo "Debug: raw response for page $PAGE:" >&2
    echo "$RESPONSE" >&2
    if [[ -n "$ERROR_MSG" ]]; then
      echo "Clerk API error: $ERROR_MSG" >&2
    fi
    break
  fi

  COUNT=$(echo "$USERS" | jq 'length')
  if [[ "$COUNT" -eq 0 ]]; then
    break
  fi

  if [[ "$HEADER_PRINTED" = false ]]; then
    printf "%-24s %-40s %-24s\n" "USER_ID" "EMAIL" "CREATED_AT"
    printf "%-24s %-40s %-24s\n" "------------------------" "----------------------------------------" "------------------------"
    HEADER_PRINTED=true
  fi

  echo "$USERS" | jq -r '.[] | [.id, (.email_addresses[0]?.email_address // ""), .created_at] | @tsv' \
    | while IFS=$'\t' read -r ID EMAIL CREATED; do
        CREATED_SECONDS=$((CREATED / 1000))
        CREATED_HUMAN=$(date -r "$CREATED_SECONDS" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "$CREATED")
        printf "%-24s %-40s %-24s\n" "$ID" "$EMAIL" "$CREATED_HUMAN"
      done

  TOTAL=$((TOTAL + COUNT))
  PAGE=$((PAGE + 1))

  if [[ "$COUNT" -lt "$PAGE_SIZE" ]]; then
    break
  fi
done

echo "Total users: $TOTAL"
