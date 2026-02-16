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

const APP_NAME = "test-miniflux";

test.describe("library:checkout miniflux (with postgres)", () => {
  test.beforeAll(() => {
    test.skip(!pluginAvailable("postgres"), "postgres plugin not available");

    if (!appExists(APP_NAME)) {
      dokku(
        `library:checkout miniflux --name=${APP_NAME} --domain=${APP_NAME}.test.local --no-ssl --no-auth --non-interactive`,
        { timeout: 300_000 }
      );
    }
  });

  test.afterAll(() => {
    cleanupApp(APP_NAME);
  });

  test("should have postgres service created and linked", () => {
    const dbService = `${APP_NAME}-db`;
    const exists = dokku(`postgres:exists ${dbService}`, {
      ignoreError: true,
    });
    expect(exists).not.toContain("does not exist");
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

  test("should serve miniflux login page", async () => {
    const url = getAppUrl(APP_NAME);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    const body = await response.text();
    expect(body.toLowerCase()).toContain("miniflux");
  });

  test("should have working healthcheck endpoint", async () => {
    const url = getAppUrl(APP_NAME);
    const response = await fetch(`${url}/healthcheck`, {
      signal: AbortSignal.timeout(10_000),
    });
    expect(response.ok).toBe(true);
    const body = await response.text();
    expect(body).toBe("OK");
  });

  test("cleanup should destroy postgres too", () => {
    const output = dokku(`library:cleanup ${APP_NAME} --force`, {
      timeout: 120_000,
    });
    expect(output).toContain("cleaned up successfully");
    expect(output).toContain("PostgreSQL");
  });
});
