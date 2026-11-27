import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import yaml from "js-yaml";

const FUNCTIONS = resolve(import.meta.dirname, "../../functions");

/** Run `script` with the library's functions sourced, files passed as $1, $2. */
function bash(script: string, files: string[], env: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "recheckout-"));
  try {
    const paths = files.map((content, i) => {
      const p = join(dir, `f${i}.yml`);
      writeFileSync(p, content);
      return p;
    });
    return execFileSync("bash", ["-c", `source ${FUNCTIONS} >/dev/null 2>&1; ${script}`, "bash", ...paths], {
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const MANIFEST = `apps:
  bugsink:
    image: bugsink/bugsink:latest
    env:
      SECRET_KEY: "%SECRET%"
      BASE_URL: "https://%DOMAIN%"
      CREATE_SUPERUSER: "admin@%DOMAIN%:%SECRET%"
`;

const recover = (manifest: string, saved: string, placeholder: string, extra = "") =>
  bash(
    `recover_saved_secret "$(cat "$1")" "$(cat "$2")" myapp bugsink '${placeholder}' bugs.example.com ${extra}`,
    [manifest, saved],
  );

describe("recover_saved_secret", () => {
  it("finds the secret under a key that is not named SECRET", () => {
    const saved = `apps:\n  myapp:\n    env:\n      SECRET_KEY: abc123\n      CREATE_SUPERUSER: "admin@bugs.example.com:abc123"\n`;
    expect(recover(MANIFEST, saved, "%SECRET%")).toBe("abc123\n");
  });

  it("finds it inside a larger value when no key holds it alone", () => {
    const manifest = `apps:\n  bugsink:\n    env:\n      CREATE_SUPERUSER: "admin@%DOMAIN%:%SECRET%"\n`;
    const saved = `apps:\n  myapp:\n    env:\n      CREATE_SUPERUSER: "admin@bugs.example.com:s3cr3t"\n`;
    expect(recover(manifest, saved, "%SECRET%")).toBe("s3cr3t\n");
  });

  it("keeps the two secrets apart", () => {
    const manifest = `apps:\n  bugsink:\n    env:\n      A: "%SECRET%"\n      B: "%SECRET_BASE64_32%"\n      BOTH: "%SECRET%/%SECRET_BASE64_32%"\n`;
    const saved = `apps:\n  myapp:\n    env:\n      A: hexval\n      B: "b64+val="\n      BOTH: "hexval/b64+val="\n`;
    expect(recover(manifest, saved, "%SECRET%")).toBe("hexval\n");
    expect(recover(manifest, saved, "%SECRET_BASE64_32%")).toBe("b64+val=\n");
  });

  it("resolves the manifest's own prompts around the secret", () => {
    const manifest = `apps:\n  bugsink:\n    env:\n      URL: "postgres://u:%SECRET%@%DBHOST%/x"\n`;
    const saved = `apps:\n  myapp:\n    env:\n      URL: "postgres://u:pw@db.local/x"\n`;
    expect(recover(manifest, saved, "%SECRET%", "DBHOST=db.local")).toBe("pw\n");
  });

  it("prints nothing when no saved value matches its template", () => {
    const saved = `apps:\n  myapp:\n    env:\n      CREATE_SUPERUSER: "someone-else:abc"\n`;
    const manifest = `apps:\n  bugsink:\n    env:\n      CREATE_SUPERUSER: "admin@%DOMAIN%:%SECRET%"\n`;
    expect(recover(manifest, saved, "%SECRET%")).toBe("");
  });
});

describe("add_external_env_secrets", () => {
  // dokku_cmd stands in for the live app's `config:keys`.
  const withLiveKeys = (saved: string, keys: string[]) =>
    yaml.load(
      bash(
        `dokku_cmd() { printf '%s\\n' ${keys.map((k) => `'${k}'`).join(" ")}; }; add_external_env_secrets "$(cat "$1")" myapp`,
        [saved],
      ),
    ) as { apps: { myapp: { env: Record<string, string>; secrets?: string[] } } };

  const SAVED = `apps:\n  myapp:\n    env:\n      BASE_URL: https://x\n      SECRET_KEY: abc\n`;

  it("lists live keys the dokkufile does not set, leaving dokku's own out", () => {
    const out = withLiveKeys(SAVED, ["AUTHELIA_DOMAIN", "BASE_URL", "DATABASE_URL", "DOKKU_APP_TYPE", "GIT_REV", "SECRET_KEY"]);
    expect(out.apps.myapp.secrets).toEqual(["AUTHELIA_DOMAIN", "DATABASE_URL"]);
    expect(out.apps.myapp.env).toEqual({ BASE_URL: "https://x", SECRET_KEY: "abc" });
  });

  it("merges with secrets already listed, without duplicates", () => {
    const saved = SAVED + `    secrets: ["DATABASE_URL"]\n`;
    expect(withLiveKeys(saved, ["DATABASE_URL", "AUTHELIA_DOMAIN"]).apps.myapp.secrets).toEqual(["DATABASE_URL", "AUTHELIA_DOMAIN"]);
  });

  it("leaves the yaml alone when every live key is the dokkufile's", () => {
    expect(withLiveKeys(SAVED, ["BASE_URL", "SECRET_KEY"]).apps.myapp.secrets).toBeUndefined();
  });
});
