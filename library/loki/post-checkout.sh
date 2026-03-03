#!/usr/bin/env bash
# Post-checkout hook for Loki.
# Runs in the context of the checkout script with access to:
#   $app_name, $domain, $manifest, $library_app, and all functions.

# Wire Loki as a Grafana data source
echo "       Configuring Grafana data source"
grafana_app="$(find_app_by_manifest "grafana" 2>/dev/null || true)"
if [[ -n "$grafana_app" ]]; then
  # Get Loki internal network address
  loki_listeners="$(dokku_cmd network:report "$app_name" --network-web-listeners 2>/dev/null || true)"
  loki_addr="${loki_listeners%%,*}"

  if [[ -n "$loki_addr" ]]; then
    provisioning_dir="/var/lib/dokku/data/storage/${grafana_app}-provisioning/datasources"
    mkdir -p "$provisioning_dir"

    cat >"$provisioning_dir/loki.yml" <<DATASOURCE
apiVersion: 1
datasources:
  - name: Loki
    type: loki
    access: proxy
    url: http://${loki_addr}
    isDefault: false
    editable: false
DATASOURCE

    echo "       Restarting Grafana to pick up data source"
    dokku_cmd ps:restart "$grafana_app" 2>/dev/null || true
  else
    echo "       Warning: Could not determine Loki network address for Grafana"
  fi
else
  echo "       Warning: Grafana app not found, skipping data source setup"
fi
