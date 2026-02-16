import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 300_000,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "integration",
      testDir: "./tests/e2e",
      testMatch: ["checkout.spec.ts", "doctor.spec.ts", "lifecycle.spec.ts", "ghost.spec.ts", "linkding.spec.ts", "miniflux.spec.ts", "vaultwarden.spec.ts", "grafana.spec.ts", "radarr.spec.ts", "sonarr.spec.ts", "jellyfin.spec.ts", "uptime-kuma.spec.ts", "mealie.spec.ts", "paperless-ngx.spec.ts", "outline.spec.ts", "gitea.spec.ts", "bookstack.spec.ts"],
    },
    {
      name: "apps",
      testDir: "./tests/e2e/apps",
      testMatch: "*.spec.ts",
      timeout: 600_000,
    },
  ],
});
