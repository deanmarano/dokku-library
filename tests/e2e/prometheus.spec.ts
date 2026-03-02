import { test, expect } from "@playwright/test";
import {
  dokku,
  waitForHealthy,
  cleanupApp,
  appExists,
  getAppUrl,
  waitForHttp,
  pluginAvailable,
} from "./helpers.js";

const APP_NAME = "test-prometheus";

test.describe("library:checkout prometheus (with grafana dependency)", () => {
  test.beforeAll(() => {
    test.skip(!pluginAvailable("postgres"), "postgres plugin not available");

    if (!appExists(APP_NAME)) {
      // Prometheus requires grafana — checkout should auto-install it.
      // We don't pre-install grafana; ensure_requirements handles it.
      dokku(
        `library:checkout prometheus --name=${APP_NAME} --no-ssl --no-auth --no-mail --non-interactive`,
        { timeout: 600_000 }
      );
    }
  });

  test.afterAll(() => {
    cleanupApp(APP_NAME);
    // Grafana was auto-installed as a dependency — clean it up too
    cleanupApp("grafana");
  });

  test("should have auto-installed grafana as a dependency", () => {
    const exists = appExists("grafana");
    expect(exists).toBe(true);
  });

  test("should be running and healthy", async () => {
    const healthy = await waitForHealthy(APP_NAME, 120_000);
    expect(healthy).toBe(true);
  });

  test("should respond on HTTP", async () => {
    const url = getAppUrl(APP_NAME);
    const reachable = await waitForHttp(url, 60_000);
    expect(reachable).toBe(true);
  });

  test("should have healthy endpoint", async () => {
    const url = getAppUrl(APP_NAME);
    const response = await fetch(`${url}/-/healthy`, {
      signal: AbortSignal.timeout(10_000),
    });
    expect(response.ok).toBe(true);
    const body = await response.text();
    expect(body).toContain("Healthy");
  });

  test("should have prometheus config with targets file", () => {
    const result = dokku(
      `run ${APP_NAME} cat /etc/prometheus/prometheus.yml`,
      {
        ignoreError: true,
        timeout: 30_000,
      }
    );
    expect(result).toContain("dokku-apps");
    expect(result).toContain("targets.json");
  });

  test("cleanup should leave grafana intact", () => {
    const output = dokku(`library:cleanup ${APP_NAME} --force`, {
      timeout: 120_000,
    });
    expect(output).toContain("cleaned up successfully");

    // Grafana should still exist
    expect(appExists("grafana")).toBe(true);
  });
});
