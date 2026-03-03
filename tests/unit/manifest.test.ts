import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import yaml from "js-yaml";

const LIBRARY_DIR = resolve(import.meta.dirname, "../../library");

const KNOWN_SERVICE_TYPES = ["postgres", "mariadb", "redis"];
const KNOWN_PLACEHOLDERS = ["%DOMAIN%", "%APP_NAME%", "%SECRET%", "%SECRET_BASE64_32%", "%HOSTNAME%"];
const IMAGE_PATTERN = /^[a-z0-9._/-]+:[a-z0-9._-]+$/i;
const KNOWN_CONNECTION_ENV_MODES = ["env", "prefix", "map"];

interface Manifest {
  library: {
    description: string;
    url: string;
    requires?: string[];
    prompts?: Array<{
      key: string;
      question: string;
      default: string;
    }>;
    connection_env?: {
      service: string;
      type: string;
      mode: string;
      env_var?: string;
      scheme?: string;
      prefix?: string;
      separator?: string;
      case?: string;
      map?: Record<string, string>;
    };
  };
  services?: Record<string, { type: string }>;
  apps: Record<
    string,
    {
      image: string;
      domains?: string[];
      ports?: Record<string, string>;
      env?: Record<string, string>;
      links?: Record<string, string>;
      storage?: string[];
      docker_options?: Record<string, string[]>;
      letsencrypt?: boolean;
      healthchecks?: Record<string, Array<{ path?: string; timeout?: number; uptime?: number }>>;
      scheduler?: Record<string, string>;
      scripts?: Record<string, string>;
    }
  >;
}

function getManifestDirs(): string[] {
  if (!existsSync(LIBRARY_DIR)) return [];
  return readdirSync(LIBRARY_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function loadManifest(appName: string): Manifest {
  const manifestPath = join(LIBRARY_DIR, appName, "manifest.yml");
  const content = readFileSync(manifestPath, "utf-8");
  return yaml.load(content) as Manifest;
}

describe("manifest validation", () => {
  const appDirs = getManifestDirs();

  it("should have at least one app in library", () => {
    expect(appDirs.length).toBeGreaterThan(0);
  });

  for (const appName of appDirs) {
    describe(`${appName}/manifest.yml`, () => {
      let manifest: Manifest;

      it("should be valid YAML", () => {
        expect(() => {
          manifest = loadManifest(appName);
        }).not.toThrow();
      });

      it("should have library section with required fields", () => {
        manifest = loadManifest(appName);
        expect(manifest).toHaveProperty("library");
        expect(manifest.library).toHaveProperty("description");
        expect(manifest.library).toHaveProperty("url");
      });

      it("should have apps section with at least one app", () => {
        manifest = loadManifest(appName);
        expect(manifest).toHaveProperty("apps");
        const appNames = Object.keys(manifest.apps);
        expect(appNames.length).toBe(1);
      });

      it("should have app key matching directory name", () => {
        manifest = loadManifest(appName);
        const appNames = Object.keys(manifest.apps);
        expect(appNames[0]).toBe(appName);
      });

      it("should have a valid image reference", () => {
        manifest = loadManifest(appName);
        const app = Object.values(manifest.apps)[0];
        expect(app.image).toBeTruthy();
        expect(IMAGE_PATTERN.test(app.image)).toBe(true);
      });

      it("should have valid service types", () => {
        manifest = loadManifest(appName);
        if (manifest.services) {
          for (const [, svc] of Object.entries(manifest.services)) {
            expect(KNOWN_SERVICE_TYPES).toContain(svc.type);
          }
        }
      });

      it("should have links referencing declared services", () => {
        manifest = loadManifest(appName);
        const app = Object.values(manifest.apps)[0];
        if (app.links) {
          for (const [linkType, svcName] of Object.entries(app.links)) {
            expect(KNOWN_SERVICE_TYPES).toContain(linkType);
            expect(manifest.services).toBeTruthy();
            expect(manifest.services![svcName]).toBeTruthy();
            expect(manifest.services![svcName].type).toBe(linkType);
          }
        }
      });

      it("should have valid env var placeholders", () => {
        manifest = loadManifest(appName);
        const app = Object.values(manifest.apps)[0];
        const env = app.env || {};
        for (const [, value] of Object.entries(env)) {
          const matches = String(value).match(/%[A-Z_]+%/g) || [];
          for (const match of matches) {
            expect(KNOWN_PLACEHOLDERS).toContain(match);
          }
        }
      });

      it("should have valid prompt defaults with known placeholders", () => {
        manifest = loadManifest(appName);
        for (const prompt of manifest.library.prompts || []) {
          if (prompt.default) {
            const matches = prompt.default.match(/%[A-Z_]+%/g) || [];
            for (const match of matches) {
              expect(KNOWN_PLACEHOLDERS).toContain(match);
            }
          }
        }
      });

      it("should have valid ports format", () => {
        manifest = loadManifest(appName);
        const app = Object.values(manifest.apps)[0];
        if (app.ports) {
          for (const [proto, portMap] of Object.entries(app.ports)) {
            expect(proto).toMatch(/^(http|https)$/);
            expect(String(portMap)).toMatch(/^\d+:\d+$/);
          }
        }
      });

      it("should have http port when letsencrypt is enabled", () => {
        manifest = loadManifest(appName);
        const app = Object.values(manifest.apps)[0];
        if (app.letsencrypt) {
          expect(app.ports).toBeTruthy();
          expect(app.ports!.http).toBeTruthy();
          expect(String(app.ports!.http)).toMatch(/^80:\d+$/);
        }
      });

      it("should have valid connection_env if present", () => {
        manifest = loadManifest(appName);
        if (manifest.library.connection_env) {
          const ce = manifest.library.connection_env;
          expect(KNOWN_SERVICE_TYPES).toContain(ce.type);
          expect(KNOWN_CONNECTION_ENV_MODES).toContain(ce.mode);

          if (ce.mode === "env") {
            expect(ce.env_var).toBeTruthy();
          }
          if (ce.mode === "prefix") {
            expect(ce.prefix).toBeTruthy();
          }
          if (ce.mode === "map") {
            expect(ce.map).toBeTruthy();
          }
        }
      });

      it("should have valid healthchecks if present", () => {
        manifest = loadManifest(appName);
        const app = Object.values(manifest.apps)[0];
        if (app.healthchecks) {
          for (const [processType, checks] of Object.entries(
            app.healthchecks
          )) {
            expect(processType).toBeTruthy();
            expect(checks.length).toBeGreaterThan(0);
            for (const check of checks) {
              if (processType === "uptime") {
                expect(check.uptime).toBeGreaterThan(0);
              } else {
                expect(check.path).toBeTruthy();
                expect(check.timeout).toBeGreaterThan(0);
              }
            }
          }
        }
      });

      it("should have requires referencing existing library manifests", () => {
        manifest = loadManifest(appName);
        if (manifest.library.requires) {
          expect(Array.isArray(manifest.library.requires)).toBe(true);
          for (const req of manifest.library.requires) {
            expect(typeof req).toBe("string");
            expect(appDirs).toContain(req);
          }
        }
      });
    });
  }
});
