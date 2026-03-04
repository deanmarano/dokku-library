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
const LIBRARY_APP = "uptime-kuma";
const DOMAIN = `${APP_NAME}.test.local`;

test.describe("library:checkout", () => {
  test.afterAll(() => {
    cleanupApp(APP_NAME);
  });

  test("should have app deployed by CI", () => {
    // The checkout is performed in the CI bash step (before Playwright)
    // because dokku's plugn/go-basher dispatch requires a bash parent process.
    // Verify the checkout succeeded.
    expect(appExists(APP_NAME)).toBe(true);
  });

  test("should show app as installed in list", () => {
    const output = dokku("library:list --installed");
    expect(output).toContain(APP_NAME);
  });

  test("should have app running", async () => {
    const healthy = await waitForHealthy(APP_NAME, 120_000);
    expect(healthy).toBe(true);
  });

  test("should respond on HTTP", async () => {
    const url = getAppUrl(APP_NAME);
    const reachable = await waitForHttp(url, 60_000);
    expect(reachable).toBe(true);
  });

  test("should show correct status", () => {
    const output = dokku(`library:status ${APP_NAME}`);
    expect(output).toContain(APP_NAME);
  });

  test("should show correct info", () => {
    const output = dokku(`library:info ${LIBRARY_APP}`);
    expect(output).toContain(LIBRARY_APP);
  });

  test("should re-checkout existing app", () => {
    const output = dokku(
      `library:checkout ${LIBRARY_APP} --name=${APP_NAME} --domain=${DOMAIN} --no-ssl --no-auth --non-interactive`,
      { timeout: 120_000 }
    );
    expect(output).toContain("re-checked out successfully");
  });

  test("cleanup should work", () => {
    const output = dokku(`library:cleanup ${APP_NAME} --force`, {
      timeout: 120_000,
    });
    expect(output).toContain("cleaned up");
    expect(appExists(APP_NAME)).toBe(false);
  });
});
