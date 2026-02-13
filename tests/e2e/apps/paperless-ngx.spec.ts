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

const APP = "test-paperless-ngx";
const LIBRARY_APP = "paperless-ngx";
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
    const httpReady = await waitForHttp(`http://${DOMAIN}/`, 120_000);
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

  test("can access Paperless-ngx dashboard", async ({ page }) => {
    await page.goto(`http://${DOMAIN}/`);
    await loginViaAuthelia(page, TEST_USER.username, TEST_USER.password);
    const adminPassword = getConfig(APP, "PAPERLESS_ADMIN_PASSWORD");
    // Paperless-ngx has its own login
    const loginForm = page.locator('input[name="username"], #id_username');
    if (await loginForm.isVisible({ timeout: 5000 }).catch(() => false)) {
      await loginForm.fill("admin");
      await page.locator('input[name="password"], #id_password').fill(adminPassword);
      await page.locator('button[type="submit"]').click();
      await page.waitForLoadState("networkidle");
    }
    const content = await page.content();
    expect(
      content.includes("Paperless") ||
        content.includes("Dashboard") ||
        content.includes("Documents")
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
