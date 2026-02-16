import { test, expect } from "@playwright/test";
import {
  dokku,
  waitForHealthy,
  cleanupApp,
  appExists,
  getAppUrl,
  waitForHttp,
} from "./helpers.js";

const APP_NAME = "test-sonarr";

test.describe("library:checkout sonarr (no database)", () => {
  test.beforeAll(() => {
    if (!appExists(APP_NAME)) {
      dokku(
        `library:checkout sonarr --name=${APP_NAME} --domain=${APP_NAME}.test.local --no-ssl --no-auth --non-interactive`,
        { timeout: 300_000 }
      );
    }
  });

  test.afterAll(() => {
    cleanupApp(APP_NAME);
  });

  test("should have storage mounts configured", () => {
    const report = dokku(`storage:report ${APP_NAME}`, { ignoreError: true });
    expect(report).toContain("/config");
    expect(report).toContain("/tv");
    expect(report).toContain("/downloads");
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

  test("should serve sonarr UI", async () => {
    const url = getAppUrl(APP_NAME);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    const body = await response.text();
    expect(body.toLowerCase()).toContain("sonarr");
  });

  test("cleanup should succeed", () => {
    const output = dokku(`library:cleanup ${APP_NAME} --force`, {
      timeout: 120_000,
    });
    expect(output).toContain("cleaned up successfully");
  });
});
