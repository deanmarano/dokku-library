#!/usr/bin/env bash
# Generate Prometheus file_sd targets from running dokku apps.
# Usage: generate-targets.sh <prometheus-app-name>
set -eo pipefail

PROM_APP="${1:-prometheus}"
CONFIG_DIR="/var/lib/dokku/data/storage/${PROM_APP}-config"
TARGETS_FILE="$CONFIG_DIR/targets.json"
DOKKU_BIN="${DOKKU_BIN:-/usr/bin/dokku}"

if [[ ! -d "$CONFIG_DIR" ]]; then
  exit 0
fi

targets="["
first=true

# List all apps, skip header line
apps="$("$DOKKU_BIN" apps:list 2>/dev/null | tail -n +2 || true)"

while IFS= read -r app; do
  [[ -z "$app" ]] && continue
  # Skip the prometheus app itself (it has a static config)
  [[ "$app" == "$PROM_APP" ]] && continue

  # Get the app's internal network address
  listeners="$("$DOKKU_BIN" network:report "$app" --network-web-listeners 2>/dev/null || true)"
  addr="${listeners%%,*}"

  [[ -z "$addr" ]] && continue

  if [[ "$first" == "true" ]]; then
    first=false
  else
    targets="$targets,"
  fi

  targets="$targets{\"targets\":[\"$addr\"],\"labels\":{\"job\":\"dokku\",\"app\":\"$app\"}}"
done <<<"$apps"

targets="$targets]"

# Atomic write via temp file
tmp="$(mktemp "$CONFIG_DIR/.targets.XXXXXX")"
echo "$targets" >"$tmp"
mv "$tmp" "$TARGETS_FILE"
