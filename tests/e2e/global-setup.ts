import { libraryInstalled, pluginAvailable } from "./helpers.js";

export default function globalSetup() {
  console.log("Global setup: verifying environment...");

  if (!libraryInstalled()) {
    throw new Error(
      "dokku-library plugin is not installed. Install it first:\n" +
        "  sudo ln -s $(pwd) /var/lib/dokku/plugins/available/library\n" +
        "  sudo dokku plugin:enable library"
    );
  }

  console.log("  [OK] dokku-library plugin installed");

  if (!pluginAvailable("dokkufile")) {
    throw new Error(
      "dokkufile plugin is not installed. Install it first:\n" +
        "  sudo dokku plugin:install https://github.com/deanmarano/dokkufile.git dokkufile"
    );
  }

  console.log("  [OK] dokkufile plugin installed");

  if (pluginAvailable("postgres")) {
    console.log("  [OK] postgres plugin available");
  } else {
    console.log(
      "  [WARN] postgres plugin not available - postgres-dependent tests will be skipped"
    );
  }

  if (pluginAvailable("mariadb")) {
    console.log("  [OK] mariadb plugin available");
  } else {
    console.log(
      "  [WARN] mariadb plugin not available - mariadb-dependent tests will be skipped"
    );
  }

  if (pluginAvailable("redis")) {
    console.log("  [OK] redis plugin available");
  } else {
    console.log(
      "  [WARN] redis plugin not available - redis-dependent tests will be skipped"
    );
  }

  console.log("Global setup complete.");
}
