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

const APP_NAME = "test-linkding";

test.describe("library:checkout linkding (with postgres)", () => {
  test.beforeAll(() => {
    test.skip(!pluginAvailable("postgres"), "postgres plugin not available");

    // In CI, the app is pre-deployed by a bash step (Node.js can't run git:from-image).
    // Locally, deploy if the app doesn't exist yet.
    if (!appExists(APP_NAME)) {
      dokku(
        `library:checkout linkding --name=${APP_NAME} --domain=${APP_NAME}.test.local --no-ssl --no-auth --non-interactive`,
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

  test("should serve linkding content", async () => {
    const url = getAppUrl(APP_NAME);
    // Follow the whole chain rather than inspecting the first hop: an
    // unauthenticated visitor is sent to the login page via /bookmarks, so
    // asserting that the first Location contains "login" only held while
    // linkding redirected straight there.
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    expect(response.status).toBe(200);

    const body = (await response.text()).toLowerCase();
    expect(body).toContain("linkding");

    // And it is the login page that an unauthenticated visitor lands on.
    const landedOn = new URL(response.url).pathname;
    expect(landedOn.includes("login") || body.includes("login")).toBe(true);
  });

  test("cleanup should destroy postgres too", () => {
    const output = dokku(`library:cleanup ${APP_NAME} --force`, {
      timeout: 120_000,
    });
    expect(output).toContain("cleaned up successfully");
    expect(output).toContain("PostgreSQL");
  });
});
