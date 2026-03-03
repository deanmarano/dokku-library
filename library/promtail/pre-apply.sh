#!/usr/bin/env bash
# Pre-apply hook for Promtail.
# Runs after storage directories are created, before dokkufile:apply.
# Seeds the Promtail config with the Loki push URL so the container can start.

config_dir="/var/lib/dokku/data/storage/${app_name}-config"

if [[ ! -f "$config_dir/config.yml" ]]; then
  echo "       Seeding Promtail configuration"

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

  sed "s|%LOKI_URL%|${loki_push_url}|g" \
    "$PLUGIN_BASE_PATH/library/promtail/config.yml" \
    >"$config_dir/config.yml"
fi
