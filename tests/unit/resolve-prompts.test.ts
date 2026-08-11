import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const FUNCTIONS = resolve(import.meta.dirname, "../../functions");

const MANIFEST = `library:
  description: Test app
  url: https://example.com
  prompts:
    - key: DOMAIN
      question: Domain
      default: test.%HOSTNAME%
    - key: TZ
      question: Timezone
      default: UTC

apps:
  testapp:
    image: example/testapp:1
    domains: ["%DOMAIN%"]
    env:
      TZ: "%TZ%"
      GREETING: "hello %NAME%"
`;

/**
 * Resolve a manifest the way checkout does, passing the answers the user gave
 * to the manifest's own prompts.
 */
function resolveWith(promptPairs: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "resolve-prompts-"));
  const manifest = join(dir, "manifest.yml");
  writeFileSync(manifest, MANIFEST);
  try {
    return execFileSync(
      "bash",
      [
        "-c",
        `source ${FUNCTIONS} >/dev/null 2>&1; ` +
          // The function takes the manifest's contents, not its path.
          `resolve_dokkufile_yaml "$(cat ${manifest})" testapp testapp app.example.com secret b64 true true ` +
          promptPairs.map((p) => `'${p}'`).join(" "),
      ],
      { encoding: "utf8" },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("resolve_dokkufile_yaml prompt placeholders", () => {
  it("substitutes a prompt answer into the app's env", () => {
    // Without this, TZ reached the container as the literal string "%TZ%".
    const out = resolveWith(["TZ=Europe/London"]);
    expect(out).toContain("Europe/London");
    expect(out).not.toContain("%TZ%");
  });

  it("substitutes several prompts in one pass", () => {
    const out = resolveWith(["TZ=UTC", "NAME=world"]);
    expect(out).toContain("hello world");
    expect(out).not.toContain("%NAME%");
  });

  it("still resolves the placeholders it always did", () => {
    const out = resolveWith(["TZ=UTC"]);
    expect(out).toContain("app.example.com");
    expect(out).not.toContain("%DOMAIN%");
  });

  it("leaves a placeholder alone when no answer was given for it", () => {
    // Better a visible %TZ% than a silently empty timezone.
    const out = resolveWith([]);
    expect(out).toContain("%TZ%");
  });

  it("accepts an answer containing an equals sign", () => {
    const out = resolveWith(["TZ=a=b"]);
    expect(out).toContain("a=b");
  });
});
