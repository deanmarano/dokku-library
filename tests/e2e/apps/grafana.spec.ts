import { test, expect } from "@playwright/test";
import {
  dokku,
  cleanupApp,
  waitForHealthy,
  waitForHttp,
  addHostsEntry,
  setupAuthServices,
  teardownAuthServices,
  createLdapTestUser,
  loginViaAuthelia,
  verifyAutheliaRedirect,
  waitForAuthHealthy,
  getConfig,
  pluginAvailable,
  type TestUser,
} from "../helpers.js";

const APP = "test-grafana";
const LIBRARY_APP = "grafana";
const DOMAIN = `${APP}.test.local`;
const AUTH_SERVICE = "test-auth";
const FRONTEND_SERVICE = "test-frontend";
const TEST_USER: TestUser = {
  username: "testuser",
  email: "testuser@test.local",
  password: "TestPass123!",
};

test.describe(`${LIBRARY_APP} e2e`, () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    test.skip(!pluginAvailable("postgres"), "postgres plugin not available");
    test.skip(!pluginAvailable("sso"), "sso plugin not available");

    setupAuthServices(AUTH_SERVICE, FRONTEND_SERVICE);
    await waitForAuthHealthy(AUTH_SERVICE);
    createLdapTestUser(AUTH_SERVICE, TEST_USER);
    addHostsEntry(DOMAIN);
    dokku(
      `library:checkout ${LIBRARY_APP} --name=${APP} --domain=${DOMAIN} --no-ssl --non-interactive --auth-service=${AUTH_SERVICE}`,
      { timeout: 300_000 }
    );
  });

  test.afterAll(() => {
    cleanupApp(APP);
    teardownAuthServices(AUTH_SERVICE, FRONTEND_SERVICE);
  });

  test("checkout succeeds and app is running", async () => {
    const healthy = await waitForHealthy(APP, 120_000);
    expect(healthy).toBe(true);
    const httpReady = await waitForHttp(`http://${DOMAIN}/`, 60_000);
    expect(httpReady).toBe(true);
  });

  test("unauthenticated access redirects to Authelia", async ({ page }) => {
    const redirected = await verifyAutheliaRedirect(
      page,
      `http://${DOMAIN}/`
    );
    expect(redirected).toBe(true);
  });

  test("login via Authelia grants access to Grafana", async ({ page }) => {
    await page.goto(`http://${DOMAIN}/`);
    await loginViaAuthelia(page, TEST_USER.username, TEST_USER.password);
    await expect(page).toHaveURL(new RegExp(DOMAIN));
  });

  test("auth proxy auto-logs user into Grafana after Authelia", async ({ page }) => {
    await page.goto(`http://${DOMAIN}/`);
    await loginViaAuthelia(page, TEST_USER.username, TEST_USER.password);
    // With auth proxy enabled, Grafana should NOT show its own login form —
    // the user should be automatically signed in via the Remote-User header
    const loginForm = page.locator('input[name="user"], [data-testid="data-testid Username input"]');
    const loginVisible = await loginForm.isVisible({ timeout: 5000 }).catch(() => false);
    expect(loginVisible).toBe(false);
    // Should be inside Grafana (home/dashboard)
    const content = await page.content();
    expect(
      content.includes("Grafana") ||
        content.includes("Home") ||
        content.includes("dashboard")
    ).toBe(true);
  });

  test("sso_env variables are set on the app", () => {
    const authProxyEnabled = getConfig(APP, "GF_AUTH_PROXY_ENABLED");
    expect(authProxyEnabled).toBe("true");
    const headerName = getConfig(APP, "GF_AUTH_PROXY_HEADER_NAME");
    expect(headerName).toBe("Remote-User");
  });

  test("cleanup succeeds completely", () => {
    const output = dokku(`library:cleanup ${APP} --force`, {
      timeout: 120_000,
      ignoreError: true,
    });
    expect(output).toContain("cleaned up");
  });
});
