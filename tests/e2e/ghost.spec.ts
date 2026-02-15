import { test, expect } from "@playwright/test";
import {
  dokku,
  waitForHealthy,
  cleanupApp,
  appExists,
  getAppUrl,
  waitForHttp,
} from "./helpers.js";

const APP_NAME = "test-ghost";

test.describe("library:checkout ghost", () => {
  test.beforeAll(() => {
    // In CI, the app is pre-deployed by a bash step (Node.js can't run git:from-image).
    // Locally, deploy if the app doesn't exist yet.
    if (!appExists(APP_NAME)) {
      dokku(
        `library:checkout ghost --name=${APP_NAME} --domain=${APP_NAME}.test.local --no-ssl --no-auth --no-mail --non-interactive`,
        { timeout: 300_000 }
      );
    }
  });

  test.afterAll(() => {
    cleanupApp(APP_NAME);
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

  test("cleanup should succeed", () => {
    const output = dokku(`library:cleanup ${APP_NAME} --force`, {
      timeout: 120_000,
    });
    expect(output).toContain("cleaned up successfully");
  });
});
