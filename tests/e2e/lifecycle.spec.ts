import { test, expect } from "@playwright/test";
import { dokku, waitForHealthy, cleanupApp, appExists } from "./helpers.js";

const APP_NAME = "test-lifecycle-app";

test.describe("library lifecycle (stop/restart/cleanup)", () => {
  test.beforeAll(() => {
    // In CI, the app is pre-deployed by a bash step (Node.js can't run git:from-image).
    // Locally, deploy if the app doesn't exist yet.
    if (!appExists(APP_NAME)) {
      dokku(
        `library:checkout uptime-kuma --name=${APP_NAME} --domain=${APP_NAME}.test.local --no-ssl --no-auth --non-interactive`,
        { timeout: 300_000 }
      );
    }
  });

  test("should stop the app", () => {
    const output = dokku(`library:stop ${APP_NAME}`);
    expect(output).toContain("stopped");

    const running = dokku(`ps:report ${APP_NAME} --running`, {
      ignoreError: true,
    });
    expect(running).toBe("false");
  });

  test("should restart the app", async () => {
    const output = dokku(`library:restart ${APP_NAME}`, { timeout: 120_000 });
    expect(output).toContain("restarted");

    const healthy = await waitForHealthy(APP_NAME, 60_000);
    expect(healthy).toBe(true);
  });

  test("should cleanup the app", () => {
    const output = dokku(`library:cleanup ${APP_NAME} --force`, {
      timeout: 120_000,
    });
    expect(output).toContain("cleaned up successfully");

    expect(appExists(APP_NAME)).toBe(false);
  });

  test("should reject operations on cleaned-up app", () => {
    const stopOutput = dokku(`library:stop ${APP_NAME}`, {
      ignoreError: true,
    });
    expect(stopOutput).toContain("not installed");

    const restartOutput = dokku(`library:restart ${APP_NAME}`, {
      ignoreError: true,
    });
    expect(restartOutput).toContain("not installed");
  });
});
