#!/usr/bin/env bash
# Pre-apply hook for Loki.
# Runs after storage directories are created, before dokkufile:apply.
# Seeds the Loki config so the container can start on first deploy.

config_dir="/var/lib/dokku/data/storage/${app_name}-config"

if [[ ! -f "$config_dir/local-config.yaml" ]]; then
  echo "       Seeding Loki configuration"
  cp "$PLUGIN_BASE_PATH/library/loki/local-config.yaml" "$config_dir/local-config.yaml"
fi
