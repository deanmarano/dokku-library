#!/usr/bin/env bash
# Post-checkout hook for Prometheus.
# Runs in the context of the checkout script with access to:
#   $app_name, $domain, $manifest, $library_app, and all functions.

echo "       Seeding Prometheus configuration"

config_dir="/var/lib/dokku/data/storage/${app_name}-config"
script_dir="$PLUGIN_BASE_PATH/library/prometheus/scripts"

# Seed initial prometheus.yml if not already present
if [[ ! -f "$config_dir/prometheus.yml" ]]; then
  cp "$PLUGIN_BASE_PATH/library/prometheus/prometheus.yml" "$config_dir/prometheus.yml"
fi

# Create empty targets.json for file-based service discovery
if [[ ! -f "$config_dir/targets.json" ]]; then
  echo "[]" >"$config_dir/targets.json"
fi

# Run target generation once
echo "       Running initial target discovery"
"$script_dir/generate-targets.sh" "$app_name" || true

# Wire Prometheus as a Grafana data source
echo "       Configuring Grafana data source"
grafana_app="$(find_app_by_manifest "grafana" 2>/dev/null || true)"
if [[ -n "$grafana_app" ]]; then
  # Get Prometheus internal network address
  prom_listeners="$(dokku_cmd network:report "$app_name" --network-web-listeners 2>/dev/null || true)"
  prom_addr="${prom_listeners%%,*}"

  if [[ -n "$prom_addr" ]]; then
    provisioning_dir="/var/lib/dokku/data/storage/${grafana_app}-provisioning/datasources"
    mkdir -p "$provisioning_dir"

    cat >"$provisioning_dir/prometheus.yml" <<DATASOURCE
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://${prom_addr}
    isDefault: true
    editable: false
DATASOURCE

    echo "       Restarting Grafana to pick up data source"
    dokku_cmd ps:restart "$grafana_app" 2>/dev/null || true
  else
    echo "       Warning: Could not determine Prometheus network address for Grafana"
  fi
else
  echo "       Warning: Grafana app not found, skipping data source setup"
fi
