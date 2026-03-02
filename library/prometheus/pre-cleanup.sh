#!/usr/bin/env bash
# Pre-cleanup hook for Prometheus.
# Runs in the context of the cleanup script with access to:
#   $app_name, $manifest_name, and all functions.

# Remove the Prometheus data source from Grafana provisioning
grafana_app="$(find_app_by_manifest "grafana" 2>/dev/null || true)"
if [[ -n "$grafana_app" ]]; then
  provisioning_file="/var/lib/dokku/data/storage/${grafana_app}-provisioning/datasources/prometheus.yml"
  if [[ -f "$provisioning_file" ]]; then
    echo "       Removing Prometheus data source from Grafana"
    rm -f "$provisioning_file"

    # Restart Grafana if it's still running
    if dokku_cmd ps:report "$grafana_app" --running 2>/dev/null | grep -q "true"; then
      echo "       Restarting Grafana"
      dokku_cmd ps:restart "$grafana_app" 2>/dev/null || true
    fi
  fi
fi
