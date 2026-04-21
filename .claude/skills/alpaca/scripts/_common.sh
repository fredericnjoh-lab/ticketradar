#!/usr/bin/env bash
# Shared helpers for the alpaca skill scripts.
# Source this file; do not execute it directly.

set -euo pipefail

if [[ -z "${ALPACA_KEY_ID:-}" || -z "${ALPACA_SECRET_KEY:-}" ]]; then
  echo "error: ALPACA_KEY_ID and ALPACA_SECRET_KEY must be set" >&2
  exit 2
fi

ALPACA_PAPER="${ALPACA_PAPER:-true}"
case "$ALPACA_PAPER" in
  true|1|yes)
    ALPACA_BASE="https://paper-api.alpaca.markets"
    ;;
  false|0|no)
    ALPACA_BASE="https://api.alpaca.markets"
    echo "warning: LIVE trading mode (ALPACA_PAPER=$ALPACA_PAPER)" >&2
    ;;
  *)
    echo "error: ALPACA_PAPER must be true|false, got $ALPACA_PAPER" >&2
    exit 2
    ;;
esac

ALPACA_DATA_BASE="https://data.alpaca.markets"

# Hard cap on any single order's dollar size. Defence-in-depth vs. strategy rules.
ALPACA_MAX_ORDER_USD="${ALPACA_MAX_ORDER_USD:-2500}"

# Repo root — used to locate universe.md for symbol whitelist check.
# Scripts live at <repo>/.claude/skills/alpaca/scripts/<name>.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
UNIVERSE_FILE="$REPO_ROOT/trading/strategy/universe.md"

_auth_args=(
  -H "APCA-API-KEY-ID: $ALPACA_KEY_ID"
  -H "APCA-API-SECRET-KEY: $ALPACA_SECRET_KEY"
)

# ac_get PATH [extra curl args...]
ac_get() {
  local path="$1"; shift
  curl -sS --fail-with-body "${_auth_args[@]}" "$@" "$ALPACA_BASE$path"
}

# ac_data_get PATH
ac_data_get() {
  local path="$1"; shift
  curl -sS --fail-with-body "${_auth_args[@]}" "$@" "$ALPACA_DATA_BASE$path"
}

# ac_post PATH JSON_BODY
ac_post() {
  local path="$1"
  local body="$2"
  curl -sS --fail-with-body -X POST "${_auth_args[@]}" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "$ALPACA_BASE$path"
}

# ac_delete PATH
ac_delete() {
  local path="$1"
  curl -sS --fail-with-body -X DELETE "${_auth_args[@]}" "$ALPACA_BASE$path"
}

# require_in_universe SYMBOL
require_in_universe() {
  local sym="$1"
  if [[ ! -f "$UNIVERSE_FILE" ]]; then
    echo "error: universe file missing at $UNIVERSE_FILE" >&2
    exit 3
  fi
  if ! grep -qE "^- ${sym}( |$)" "$UNIVERSE_FILE"; then
    echo "error: $sym not in universe.md — reject" >&2
    exit 3
  fi
}
