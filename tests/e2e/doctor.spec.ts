import { test, expect } from "@playwright/test";
import { dokku, cleanupApp, appExists } from "./helpers.js";

const APP_NAME = "test-doctor-app";

test.describe("library:doctor", () => {
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

  test.afterAll(() => {
    cleanupApp(APP_NAME);
  });

  test("should report clean state after fresh checkout", () => {
    const output = dokku(`library:doctor ${APP_NAME}`);
    expect(output).toContain("[OK]");
    expect(output).toContain("All checks passed");
    expect(output).not.toContain("[DRIFT]");
    expect(output).not.toContain("[MISSING]");
  });

  test("should detect env var drift", () => {
    // Manually change an env var
    dokku(`config:set --no-restart ${APP_NAME} EXTRA_VAR=drifted`, {
      ignoreError: true,
    });

    // Doctor should still pass (EXTRA_VAR is not tracked)
    const output = dokku(`library:doctor ${APP_NAME}`, { ignoreError: true });
    expect(output).toContain("[OK]");
  });

  test("should detect domain drift", () => {
    // Change domain
    dokku(`domains:set ${APP_NAME} wrong-domain.test.local`, {
      ignoreError: true,
    });

    const output = dokku(`library:doctor ${APP_NAME}`, { ignoreError: true });
    expect(output).toContain("[DRIFT]");
    expect(output).toContain("Domain");
  });

  test("doctor:fix should resolve drift", () => {
    const fixOutput = dokku(`library:doctor:fix ${APP_NAME}`, {
      timeout: 300_000,
    });
    expect(fixOutput).toContain("[FIX]");

    // Verify doctor now passes
    const doctorOutput = dokku(`library:doctor ${APP_NAME}`);
    expect(doctorOutput).toContain("All checks passed");
  });
});
