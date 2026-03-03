#!/usr/bin/env bash
# Post-checkout hook for Promtail.
# Runs in the context of the checkout script with access to:
#   $app_name, $domain, $manifest, $library_app, and all functions.

echo "       Seeding Promtail configuration"

config_dir="/var/lib/dokku/data/storage/${app_name}-data"

# Find the Loki app to get its internal address
loki_app="$(find_app_by_manifest "loki" 2>/dev/null || true)"
if [[ -z "$loki_app" ]]; then
  echo "!     Error: Loki app not found. Promtail requires Loki to be installed." >&2
  return 1
fi

loki_listeners="$(dokku_cmd network:report "$loki_app" --network-web-listeners 2>/dev/null || true)"
loki_addr="${loki_listeners%%,*}"

if [[ -z "$loki_addr" ]]; then
  echo "!     Error: Could not determine Loki network address" >&2
  return 1
fi

loki_push_url="http://${loki_addr}/loki/api/v1/push"

# Seed promtail.yml with the Loki URL substituted
if [[ ! -f "$config_dir/promtail.yml" ]]; then
  sed "s|%LOKI_URL%|${loki_push_url}|g" \
    "$PLUGIN_BASE_PATH/library/promtail/promtail.yml" \
    >"$config_dir/promtail.yml"
else
  echo "       Promtail config already exists, skipping seed"
fi
