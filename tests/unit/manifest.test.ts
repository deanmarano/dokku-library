import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const LIBRARY_DIR = resolve(import.meta.dirname, "../../library");

const REQUIRED_FIELDS = ["name", "description", "image", "plugins"];
const KNOWN_PLUGINS = ["postgres", "mariadb", "letsencrypt", "dokku-mail", "dokku-auth"];
const KNOWN_PLACEHOLDERS = ["%DOMAIN%", "%APP_NAME%", "%SECRET%", "%HOSTNAME%"];
const IMAGE_PATTERN = /^[a-z0-9._/-]+:[a-z0-9._-]+$/i;

function getManifestDirs(): string[] {
  if (!existsSync(LIBRARY_DIR)) return [];
  return readdirSync(LIBRARY_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function loadManifest(appName: string): Record<string, unknown> {
  const manifestPath = join(LIBRARY_DIR, appName, "manifest.json");
  const content = readFileSync(manifestPath, "utf-8");
  return JSON.parse(content);
}

describe("manifest validation", () => {
  const appDirs = getManifestDirs();

  it("should have at least one app in library", () => {
    expect(appDirs.length).toBeGreaterThan(0);
  });

  for (const appName of appDirs) {
    describe(`${appName}/manifest.json`, () => {
      let manifest: Record<string, unknown>;

      it("should be valid JSON", () => {
        expect(() => {
          manifest = loadManifest(appName);
        }).not.toThrow();
      });

      it("should have required fields", () => {
        manifest = loadManifest(appName);
        for (const field of REQUIRED_FIELDS) {
          expect(manifest).toHaveProperty(field);
        }
      });

      it("should have name matching directory", () => {
        manifest = loadManifest(appName);
        expect(manifest.name).toBe(appName);
      });

      it("should have a valid image reference", () => {
        manifest = loadManifest(appName);
        const image = manifest.image as string;
        expect(image).toBeTruthy();
        expect(IMAGE_PATTERN.test(image)).toBe(true);
      });

      it("should have valid plugin references", () => {
        manifest = loadManifest(appName);
        const plugins = manifest.plugins as Record<string, unknown>;
        for (const pluginName of Object.keys(plugins)) {
          expect(KNOWN_PLUGINS).toContain(pluginName);
        }
      });

      it("should have valid env var placeholders", () => {
        manifest = loadManifest(appName);
        const env = (manifest.env || {}) as Record<string, string>;
        for (const [, value] of Object.entries(env)) {
          const matches = value.match(/%[A-Z_]+%/g) || [];
          for (const match of matches) {
            expect(KNOWN_PLACEHOLDERS).toContain(match);
          }
        }
      });

      it("should have valid prompt defaults with known placeholders", () => {
        manifest = loadManifest(appName);
        const prompts = (manifest.prompts || []) as Array<{
          default?: string;
        }>;
        for (const prompt of prompts) {
          if (prompt.default) {
            const matches = prompt.default.match(/%[A-Z_]+%/g) || [];
            for (const match of matches) {
              expect(KNOWN_PLACEHOLDERS).toContain(match);
            }
          }
        }
      });

      it("should have proxy ports if ports are defined", () => {
        manifest = loadManifest(appName);
        if (manifest.ports) {
          expect(manifest.proxy).toBeTruthy();
          expect(
            (manifest.proxy as Record<string, unknown>).ports
          ).toBeTruthy();
        }
      });
    });
  }
});
