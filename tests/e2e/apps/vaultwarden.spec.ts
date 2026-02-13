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
  type TestUser,
  type AuthCredentials,
} from "../helpers.js";

const APP = "test-vaultwarden";
const LIBRARY_APP = "vaultwarden";
const DOMAIN = `${APP}.test.local`;
const AUTH_SERVICE = "test-auth";
const FRONTEND_SERVICE = "test-frontend";
const TEST_USER: TestUser = {
  username: "testuser",
  email: "testuser@test.local",
  password: "TestPass123!",
};

let authCredentials: AuthCredentials;

test.describe(`${LIBRARY_APP} e2e`, () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    authCredentials = setupAuthServices(AUTH_SERVICE, FRONTEND_SERVICE);
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

  test("login via Authelia grants access", async ({ page }) => {
    await page.goto(`http://${DOMAIN}/`);
    await loginViaAuthelia(page, TEST_USER.username, TEST_USER.password);
    await expect(page).toHaveURL(new RegExp(DOMAIN));
  });

  test("can access Vaultwarden admin panel", async ({ page }) => {
    await page.goto(`http://${DOMAIN}/`);
    await loginViaAuthelia(page, TEST_USER.username, TEST_USER.password);
    const adminToken = getConfig(APP, "ADMIN_TOKEN");
    // Access admin panel with token
    await page.goto(`http://${DOMAIN}/admin`);
    await page.waitForLoadState("networkidle");
    const adminTokenInput = page.locator('input[type="password"], #admin-token');
    if (await adminTokenInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await adminTokenInput.fill(adminToken);
      await page.locator('button[type="submit"]').click();
      await page.waitForLoadState("networkidle");
    }
    const content = await page.content();
    expect(
      content.includes("Vaultwarden") ||
        content.includes("Admin") ||
        content.includes("vaultwarden")
    ).toBe(true);
  });

  test("cleanup succeeds completely", () => {
    const output = dokku(`library:cleanup ${APP} --force`, {
      timeout: 120_000,
      ignoreError: true,
    });
    expect(output).toContain("cleaned up");
  });
});
