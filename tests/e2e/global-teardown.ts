import { cleanupApp, dokku } from "./helpers.js";

const TEST_APPS = [
  // Integration test apps
  "test-uptime-kuma",
  "test-ghost",
  "test-doctor-app",
  "test-lifecycle-app",
  // Per-app e2e test apps
  "test-ghost",
  "test-gitea",
  "test-grafana",
  "test-uptime-kuma",
  "test-plausible",
  "test-miniflux",
  "test-wallabag",
  "test-linkding",
  "test-nextcloud",
  "test-jellyfin",
  "test-immich",
  "test-radarr",
  "test-sonarr",
  "test-vaultwarden",
  "test-outline",
  "test-bookstack",
  "test-mealie",
  "test-paperless-ngx",
];

export default function globalTeardown() {
  console.log("Global teardown: cleaning up test apps...");

  // Deduplicate app names
  const uniqueApps = [...new Set(TEST_APPS)];

  for (const app of uniqueApps) {
    try {
      cleanupApp(app);
      console.log(`  Cleaned up ${app}`);
    } catch {
      console.log(`  ${app} not found or already cleaned up`);
    }
  }

  // Clean up auth services if they exist
  try {
    dokku("sso:frontend:destroy test-frontend -f", {
      timeout: 60_000,
      ignoreError: true,
    });
    console.log("  Cleaned up test-frontend auth frontend");
  } catch {
    // ignore
  }

  try {
    dokku("sso:destroy test-auth -f", {
      timeout: 60_000,
      ignoreError: true,
    });
    console.log("  Cleaned up test-auth auth directory");
  } catch {
    // ignore
  }

  console.log("Global teardown complete.");
}
