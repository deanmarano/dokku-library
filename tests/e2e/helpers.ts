import { execSync, spawnSync } from "node:child_process";
import type { Page } from "@playwright/test";

export interface DokkuOptions {
  timeout?: number;
  ignoreError?: boolean;
}

/**
 * Check if stderr contains only basher/plugn dispatch noise (not real errors).
 * dokku's plugn trigger mechanism produces spurious "main: command not found"
 * errors from /home/dokku/.basher/bash when invoked from non-shell contexts.
 */
function isBasherNoiseOnly(stderr: string): boolean {
  const lines = stderr
    .trim()
    .split("\n")
    .filter((l) => l.trim());
  return (
    lines.length > 0 &&
    lines.every(
      (l) => l.includes(".basher/bash") && l.includes("command not found")
    )
  );
}

export function dokku(cmd: string, opts: DokkuOptions = {}): string {
  const { timeout = 120_000, ignoreError = false } = opts;
  const args = cmd.split(/\s+/);
  const result = spawnSync("sudo", ["dokku", ...args], {
    timeout,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.error) {
    if (ignoreError) {
      return (result.stdout || result.stderr || "").trim();
    }
    throw result.error;
  }

  if (result.status !== 0) {
    // Tolerate spurious basher/plugn dispatch errors
    if (isBasherNoiseOnly(result.stderr || "")) {
      return (result.stdout || "").trim();
    }
    if (ignoreError) {
      return (result.stdout || result.stderr || "").trim();
    }
    const error = new Error(
      `Command failed: sudo dokku ${cmd}\n${result.stderr}`
    );
    (error as any).stdout = result.stdout;
    (error as any).stderr = result.stderr;
    (error as any).status = result.status;
    throw error;
  }

  return (result.stdout || "").trim();
}

export function waitForHealthy(
  appName: string,
  timeout = 60_000
): Promise<boolean> {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      try {
        const result = dokku(`ps:report ${appName} --ps-running`, {
          ignoreError: true,
        });
        if (result === "true") {
          resolve(true);
          return;
        }
      } catch {
        // ignore
      }
      if (Date.now() - start > timeout) {
        resolve(false);
        return;
      }
      setTimeout(check, 5000);
    };
    check();
  });
}

export async function waitForHttp(
  url: string,
  timeout = 60_000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        redirect: "manual",
      });
      if (
        response.ok ||
        response.status === 302 ||
        response.status === 301 ||
        response.status === 401
      ) {
        return true;
      }
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

export function getAppUrl(appName: string): string {
  const domains = dokku(`domains:report ${appName} --domains-app-vhosts`, {
    ignoreError: true,
  });
  const domain = domains.split(/\s+/)[0];
  return `http://${domain}`;
}

export function appExists(appName: string): boolean {
  try {
    dokku(`apps:exists ${appName}`);
    return true;
  } catch {
    return false;
  }
}

export function cleanupApp(appName: string): void {
  try {
    dokku(`library:cleanup ${appName} --force`, {
      timeout: 120_000,
      ignoreError: true,
    });
  } catch {
    // Best effort cleanup
    try {
      dokku(`apps:destroy ${appName} --force`, { ignoreError: true });
    } catch {
      // ignore
    }
  }
}

export function libraryInstalled(): boolean {
  try {
    const result = dokku("library:list", { ignoreError: true });
    return !result.includes("is not a dokku command");
  } catch {
    return false;
  }
}

export function pluginAvailable(plugin: string): boolean {
  try {
    execSync(`sudo ls /var/lib/dokku/plugins/available/${plugin}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

// --- Auth helpers ---

export interface AuthCredentials {
  authService: string;
  frontendService: string;
  ldapUrl: string;
  adminPassword: string;
}

export interface TestUser {
  username: string;
  email: string;
  password: string;
}

/**
 * Add a hostname to /etc/hosts pointing to 127.0.0.1
 */
export function addHostsEntry(domain: string): void {
  try {
    const hosts = execSync("cat /etc/hosts", { encoding: "utf-8" });
    if (!hosts.includes(domain)) {
      execSync(`echo "127.0.0.1 ${domain}" | sudo tee -a /etc/hosts`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    }
  } catch {
    // ignore errors
  }
}

/**
 * Get a dokku config value for an app
 */
export function getConfig(appName: string, key: string): string {
  return dokku(`config:get ${appName} ${key}`, { ignoreError: true });
}

/**
 * Set up auth directory + frontend services for testing.
 * Returns credentials needed for test user creation and login.
 */
export function setupAuthServices(
  authService = "test-auth",
  frontendService = "test-frontend"
): AuthCredentials {
  // Create LDAP directory service
  dokku(`auth:create ${authService}`, { timeout: 180_000 });

  // Create Authelia frontend service
  dokku(`auth:frontend:create ${frontendService}`, { timeout: 180_000 });

  // Link frontend to directory
  dokku(`auth:frontend:use-directory ${frontendService} ${authService}`, {
    timeout: 60_000,
  });

  // Get credentials
  const credentials = dokku(`auth:credentials ${authService}`, {
    ignoreError: true,
  });

  // Parse credentials output (key=value lines)
  const ldapUrl =
    credentials.match(/LDAP_URL=(.+)/)?.[1] ?? `ldap://${authService}:3890`;
  const adminPassword =
    credentials.match(/ADMIN_PASSWORD=(.+)/)?.[1] ?? "admin";

  return {
    authService,
    frontendService,
    ldapUrl,
    adminPassword,
  };
}

/**
 * Tear down auth services completely
 */
export function teardownAuthServices(
  authService = "test-auth",
  frontendService = "test-frontend"
): void {
  dokku(`auth:frontend:destroy ${frontendService} -f`, {
    timeout: 60_000,
    ignoreError: true,
  });
  dokku(`auth:destroy ${authService} -f`, {
    timeout: 60_000,
    ignoreError: true,
  });
}

/**
 * Create a test user in the LDAP directory via the auth plugin.
 */
export function createLdapTestUser(
  authService: string,
  user: TestUser
): void {
  dokku(
    `auth:create-user ${authService} ${user.username} ${user.email} ${user.password}`,
    { timeout: 30_000 }
  );
}

/**
 * Complete the Authelia login form in a Playwright page.
 * Assumes the page is already on the Authelia login page.
 */
export async function loginViaAuthelia(
  page: Page,
  username: string,
  password: string
): Promise<void> {
  // Wait for Authelia login form to be visible
  await page.waitForSelector('input[name="username"], #username-textfield', {
    timeout: 15_000,
  });

  // Fill in credentials
  const usernameField = page.locator(
    'input[name="username"], #username-textfield'
  );
  const passwordField = page.locator(
    'input[name="password"], #password-textfield'
  );

  await usernameField.fill(username);
  await passwordField.fill(password);

  // Click sign in button
  await page.locator('button[type="submit"], #sign-in-button').click();

  // Wait for redirect away from Authelia
  await page.waitForURL((url) => !url.href.includes("authelia"), {
    timeout: 15_000,
  });
}

/**
 * Verify that accessing a URL redirects to Authelia login.
 * Returns true if the redirect happened.
 */
export async function verifyAutheliaRedirect(
  page: Page,
  appUrl: string
): Promise<boolean> {
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  const url = page.url();
  return url.includes("authelia") || url.includes("/api/verify");
}

/**
 * Wait for auth services to become healthy
 */
export async function waitForAuthHealthy(
  authService = "test-auth",
  timeout = 120_000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const result = dokku(`auth:info ${authService}`, { ignoreError: true });
      if (result.includes("running") || result.includes("healthy")) {
        return true;
      }
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}
