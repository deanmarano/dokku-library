import { test, expect } from "@playwright/test";
import {
  dokku,
  waitForHealthy,
  appExists,
  cleanupApp,
  getAppUrl,
  waitForHttp,
} from "./helpers.js";

const APP_NAME = "test-uptime-kuma";

test.describe("library:checkout", () => {
  test.afterAll(() => {
    cleanupApp(APP_NAME);
  });

  test("should checkout uptime-kuma successfully", async () => {
    // Clean up any leftover from previous runs
    cleanupApp(APP_NAME);

    // Checkout uptime-kuma (simplest app - no postgres dependency)
    const output = dokku(
      `library:checkout uptime-kuma --domain=${APP_NAME}.test.local --no-ssl --non-interactive`,
      { timeout: 300_000 }
    );

    expect(output).toContain("deployed successfully");
  });

  test("should show app as installed in list", () => {
    const output = dokku("library:list --installed");
    expect(output).toContain(APP_NAME);
  });

  test("should have app running", async () => {
    const healthy = await waitForHealthy(APP_NAME, 60_000);
    expect(healthy).toBe(true);
  });

  test("should respond on HTTP", async () => {
    const url = getAppUrl(APP_NAME);
    const reachable = await waitForHttp(url, 30_000);
    expect(reachable).toBe(true);
  });

  test("should show correct status", () => {
    const output = dokku(`library:status ${APP_NAME}`);
    expect(output).toContain(APP_NAME);
  });

  test("should show correct info", () => {
    const output = dokku(`library:info ${APP_NAME}`);
    expect(output).toContain("uptime-kuma");
    expect(output).toContain("INSTALLED");
  });

  test("should reject duplicate checkout", () => {
    const output = dokku(
      `library:checkout uptime-kuma --domain=${APP_NAME}.test.local --no-ssl --non-interactive`,
      { ignoreError: true }
    );
    expect(output).toContain("already installed");
  });
});
