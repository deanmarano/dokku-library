import { test, expect } from "@playwright/test";
import {
  dokku,
  waitForHealthy,
  cleanupApp,
  getAppUrl,
  waitForHttp,
  pluginAvailable,
} from "./helpers.js";

const APP_NAME = "test-ghost";

test.describe("library:checkout ghost (with postgres)", () => {
  test.beforeAll(() => {
    if (!pluginAvailable("postgres")) {
      test.skip();
      return;
    }
    cleanupApp(APP_NAME);
  });

  test.afterAll(() => {
    cleanupApp(APP_NAME);
  });

  test("should checkout ghost with postgres", async () => {
    test.skip(!pluginAvailable("postgres"), "postgres plugin not available");

    const output = dokku(
      `library:checkout ghost --domain=${APP_NAME}.test.local --no-ssl --no-mail --non-interactive`,
      { timeout: 300_000 }
    );

    expect(output).toContain("deployed successfully");
    expect(output).toContain("PostgreSQL");
  });

  test("should have postgres service created and linked", () => {
    test.skip(!pluginAvailable("postgres"), "postgres plugin not available");

    const dbService = `${APP_NAME}-db`;
    const exists = dokku(`postgres:exists ${dbService}`, { ignoreError: true });
    // postgres:exists exits 0 if exists
    expect(exists).not.toContain("does not exist");
  });

  test("should be running and healthy", async () => {
    test.skip(!pluginAvailable("postgres"), "postgres plugin not available");

    const healthy = await waitForHealthy(APP_NAME, 120_000);
    expect(healthy).toBe(true);
  });

  test("should respond on HTTP", async () => {
    test.skip(!pluginAvailable("postgres"), "postgres plugin not available");

    const url = getAppUrl(APP_NAME);
    const reachable = await waitForHttp(url, 60_000);
    expect(reachable).toBe(true);
  });

  test("cleanup should destroy postgres too", () => {
    test.skip(!pluginAvailable("postgres"), "postgres plugin not available");

    const output = dokku(`library:cleanup ${APP_NAME} --force`, {
      timeout: 120_000,
    });
    expect(output).toContain("cleaned up successfully");
    expect(output).toContain("PostgreSQL");
  });
});
