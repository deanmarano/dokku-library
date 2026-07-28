import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const FUNCTIONS = resolve(import.meta.dirname, "../../functions");

// Call a bash function from `functions` and return its trimmed stdout.
function callBash(snippet: string): string {
  return execFileSync("bash", ["-c", `source ${FUNCTIONS} >/dev/null 2>&1; ${snippet}`], {
    encoding: "utf8",
  }).trim();
}

function mapCall(url: string, map: Record<string, string>): string[] {
  const mapYaml = Object.entries(map)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\\n");
  const out = callBash(
    `parse_database_url_map '${url}' "$(printf '${mapYaml}')"`
  );
  return out.split(/\s+/).filter(Boolean);
}

describe("parse_database_url_map", () => {
  it("maps a full postgres URL", () => {
    expect(
      mapCall("postgres://postgres:pw123@dokku-postgres-nc:5432/ncdb", {
        host: "POSTGRES_HOST",
        name: "POSTGRES_DB",
        user: "POSTGRES_USER",
        password: "POSTGRES_PASSWORD",
      })
    ).toEqual([
      "POSTGRES_HOST=dokku-postgres-nc",
      "POSTGRES_USER=postgres",
      "POSTGRES_PASSWORD=pw123",
      "POSTGRES_DB=ncdb",
    ]);
  });

  // Dokku emits redis URLs with an empty user and no database name.
  it("maps a dokku redis URL (empty user, no database name)", () => {
    expect(
      mapCall("redis://:secretpw@dokku-redis-nc:6379", {
        host: "REDIS_HOST",
        port: "REDIS_HOST_PORT",
        password: "REDIS_HOST_PASSWORD",
      })
    ).toEqual([
      "REDIS_HOST=dokku-redis-nc",
      "REDIS_HOST_PORT=6379",
      "REDIS_HOST_PASSWORD=secretpw",
    ]);
  });

  it("omits mapped components absent from the URL", () => {
    // redis URL has no database name, so POSTGRES_DB must not be emitted empty
    expect(
      mapCall("redis://:pw@host:6379", { host: "H", name: "SHOULD_NOT_APPEAR" })
    ).toEqual(["H=host"]);
  });

  it("supports host_port", () => {
    expect(
      mapCall("postgres://u:p@h:5432/d", { host_port: "GF_DATABASE_HOST" })
    ).toEqual(["GF_DATABASE_HOST=h:5432"]);
  });

  it("tolerates a password containing @", () => {
    expect(
      mapCall("postgres://user:p@ss@myhost:5432/db", {
        host: "H",
        user: "U",
        password: "P",
      })
    ).toEqual(["H=myhost", "U=user", "P=p@ss"]);
  });

  it("returns nothing for a malformed URL", () => {
    expect(mapCall("not-a-url", { host: "H" })).toEqual([]);
  });
});

describe("parse_database_url", () => {
  it("expands a URL with the default separator and lower case", () => {
    const out = callBash(
      `parse_database_url 'mysql://user:pass@host:3306/dbname' 'database__connection'`
    );
    expect(out.split(/\s+/)).toEqual([
      "database__connection__user=user",
      "database__connection__password=pass",
      "database__connection__host=host",
      "database__connection__port=3306",
      "database__connection__database=dbname",
    ]);
  });

  it("supports a custom separator and upper case", () => {
    const out = callBash(
      `parse_database_url 'postgres://u:p@h:5432/d' 'SYMFONY__ENV__DATABASE' '_' 'upper'`
    );
    expect(out.split(/\s+/)).toEqual([
      "SYMFONY__ENV__DATABASE_USER=u",
      "SYMFONY__ENV__DATABASE_PASSWORD=p",
      "SYMFONY__ENV__DATABASE_HOST=h",
      "SYMFONY__ENV__DATABASE_PORT=5432",
      "SYMFONY__ENV__DATABASE_NAME=d",
    ]);
  });

  it("returns nothing for a malformed URL", () => {
    expect(callBash(`parse_database_url 'garbage' 'PREFIX'`)).toBe("");
  });
});
