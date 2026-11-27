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

const APP_NAME = "test-bugsink";

test.describe("library:checkout bugsink (with postgres)", () => {
  test.beforeAll(() => {
    test.skip(!pluginAvailable("postgres"), "postgres plugin not available");

    if (!appExists(APP_NAME)) {
      dokku(
        `library:checkout bugsink --name=${APP_NAME} --domain=${APP_NAME}.test.local --no-ssl --no-auth --no-mail --non-interactive`,
        { timeout: 600_000 }
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

  test("should have storage mount configured", () => {
    const report = dokku(`storage:report ${APP_NAME}`, { ignoreError: true });
    expect(report).toContain("/data");
  });

  test("should be running and healthy", async () => {
    const healthy = await waitForHealthy(APP_NAME, 120_000);
    expect(healthy).toBe(true);
  });

  test("should respond on HTTP", async () => {
    const url = getAppUrl(APP_NAME);
    const reachable = await waitForHttp(url, 120_000);
    expect(reachable).toBe(true);
  });

  test("should accept its public and in-network host names behind the TLS proxy", () => {
    // Django answers 400 to any Host not listed; apps on a docker network
    // reach Bugsink as <app>.web, past the SSO on its public URL.
    const allowed = dokku(`config:get ${APP_NAME} ALLOWED_HOSTS`).trim();
    expect(allowed).toBe(`${APP_NAME}.test.local,${APP_NAME}.web`);
    expect(dokku(`config:get ${APP_NAME} BEHIND_HTTPS_PROXY`).trim()).toBe("true");
  });

  test("should attach no network when the NETWORK prompt is left blank", () => {
    const report = dokku(`network:report ${APP_NAME} --network-attach-post-deploy`, {
      ignoreError: true,
    });
    expect(report.trim()).toBe("");
  });

  test("cleanup should destroy postgres too", () => {
    const output = dokku(`library:cleanup ${APP_NAME} --force`, {
      timeout: 120_000,
    });
    expect(output).toContain("cleaned up successfully");
    expect(output).toContain("PostgreSQL");
  });
});
