import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const FUNCTIONS = resolve(import.meta.dirname, "../../functions");

interface Result {
  exitCode: number;
  stdout: string;
  stderr: string;
  state: string[];
}

/**
 * Run setup_app_auth against stubbed collaborators.
 *
 * This is the path that decides whether an app ends up behind a login. Its
 * failure mode is an app that is deployed, reachable and reported as a
 * success, so each case below asserts on the exit code and on whether the
 * "this app is protected" state was recorded.
 */
function runSetupAuth(opts: {
  pluginAvailable: boolean;
  ssoList?: string;
  protectFails?: boolean;
  linkFails?: boolean;
  oidcFails?: boolean;
  authService?: string;
  ssoLink?: boolean;
  ssoIntegration?: string;
}): Result {
  const {
    pluginAvailable,
    ssoList = "",
    protectFails = false,
    linkFails = false,
    oidcFails = false,
    authService = "",
    ssoLink = false,
    ssoIntegration = "",
  } = opts;

  const script = `
set -uo pipefail
source "${FUNCTIONS}"

check_plugin_available() { ${pluginAvailable ? "return 0" : "return 1"}; }

dokku_cmd() {
  case "$1" in
    sso:list) printf '%s\\n' "${ssoList}" ;;
    sso:protect) ${protectFails ? "return 1" : "return 0"} ;;
    sso:link) ${linkFails ? "return 1" : "return 0"} ;;
    sso:oidc:setup) ${oidcFails ? "return 1" : "return 0"} ;;
    *) return 0 ;;
  esac
}

get_manifest_field() {
  case "$2" in
    *sso_link*) echo "${ssoLink}" ;;
    *sso_integration*) echo "${ssoIntegration}" ;;
    *) echo "" ;;
  esac
}

set_app_state() { echo "STATE $2=$3"; }

setup_app_auth "myapp" "/tmp/manifest.yml" "myapp" "${authService}"
`;

  const r = spawnSync("bash", ["-c", script], { encoding: "utf-8" });
  const stdout = r.stdout ?? "";
  return {
    exitCode: r.status ?? 1,
    stdout,
    stderr: r.stderr ?? "",
    state: collectState(stdout),
  };
}

function collectState(stdout: string): string[] {
  return stdout
    .split("\n")
    .filter((l) => l.startsWith("STATE "))
    .map((l) => l.slice("STATE ".length));
}

describe("setup_app_auth", () => {
  describe("when the sso plugin is not installed", () => {
    it("fails loudly if auth was explicitly requested", () => {
      // The dangerous case: the operator asked for protection and the app is
      // already deployed. Skipping quietly leaves it open to the internet.
      const r = runSetupAuth({ pluginAvailable: false, authService: "test-auth" });
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain("sso plugin is not installed");
      expect(r.stderr).toContain("reachable without authentication");
    });

    it("says so, rather than skipping in silence", () => {
      const r = runSetupAuth({ pluginAvailable: false });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain("sso plugin not installed, skipping auth setup");
    });
  });

  describe("when no auth service exists", () => {
    it("fails if a specific service was named", () => {
      const r = runSetupAuth({ pluginAvailable: true, ssoList: "", authService: "nope" });
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain("no such auth service");
    });

    it("rejects a named service that is not in the list", () => {
      // A typo used to sail through: the name was taken on trust and the app
      // was protected against a service that does not exist.
      const r = runSetupAuth({ pluginAvailable: true, ssoList: "test-auth", authService: "tset-auth" });
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain("no such auth service");
    });

    it("skips with a message when none was named", () => {
      const r = runSetupAuth({ pluginAvailable: true, ssoList: "" });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain("No auth service found");
    });
  });

  describe("forward auth", () => {
    it("records the app as protected once sso:protect succeeds", () => {
      const r = runSetupAuth({ pluginAvailable: true, ssoList: "test-auth", authService: "test-auth" });
      expect(r.exitCode).toBe(0);
      expect(r.state).toContain("plugins/dokku-sso=test-auth");
    });

    it("fails, and records nothing, when sso:protect fails", () => {
      // Previously `|| true`: the failure vanished and the state was written
      // anyway, so the app was recorded as protected while being wide open.
      const r = runSetupAuth({
        pluginAvailable: true,
        ssoList: "test-auth",
        authService: "test-auth",
        protectFails: true,
      });
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain("sso:protect failed");
      expect(r.state).not.toContain("plugins/dokku-sso=test-auth");
    });
  });

  describe("OIDC", () => {
    it("fails, and records nothing, when sso:oidc:setup fails", () => {
      const r = runSetupAuth({
        pluginAvailable: true,
        ssoList: "test-auth",
        authService: "test-auth",
        ssoIntegration: "grafana",
        oidcFails: true,
      });
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain("sso:oidc:setup failed");
      expect(r.state).toEqual([]);
    });
  });

  describe("LDAP linking", () => {
    it("warns but carries on when sso:link fails, since the app is not exposed by it", () => {
      const r = runSetupAuth({
        pluginAvailable: true,
        ssoList: "test-auth",
        authService: "test-auth",
        ssoLink: true,
        linkFails: true,
      });
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain("sso:link failed");
      expect(r.state).not.toContain("plugins/dokku-sso-linked=true");
      // Protection still applied.
      expect(r.state).toContain("plugins/dokku-sso=test-auth");
    });
  });
});
