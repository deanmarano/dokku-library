# dokku-library

One-command open-source app deployments for [Dokku](https://dokku.com).

Browse a curated library of self-hosted apps and deploy any of them with a single command. Each app comes with a manifest that handles image selection, database provisioning, storage mounts, environment variables, and domain configuration.

## Prerequisites

- [Dokku](https://dokku.com) 0.34+
- [dokkufile](https://github.com/deanmarano/dokkufile) plugin
- [yq](https://github.com/mikefarah/yq) (installed automatically by the plugin)
- Database plugins as needed (e.g. [dokku-postgres](https://github.com/dokku/dokku-postgres), [dokku-mariadb](https://github.com/dokku/dokku-mariadb), [dokku-redis](https://github.com/dokku/dokku-redis))

## Installation

```bash
dokku plugin:install library https://github.com/deanmarano/dokku-library
```

## Quick Start

```bash
# List available apps
dokku library:list

# Deploy Ghost blog
dokku library:checkout ghost 

# Deploy with custom name and domain
dokku library:checkout ghost --name=my-blog --domain=blog.example.com

# Deploy non-interactively (uses defaults)
dokku library:checkout uptime-kuma --non-interactive
```

## Commands

| Command | Description |
|---|---|
| `library:list [--installed]` | List available apps, or only installed ones |
| `library:checkout <app> [options]` | Deploy an app from the library |
| `library:status [<app>]` | Show status of installed app(s) |
| `library:info <app>` | Show details of a library app |
| `library:doctor <app>` | Check for drift between expected and actual state |
| `library:doctor:fix <app>` | Fix drift and apply updates |
| `library:stop <app>` | Stop an installed app |
| `library:restart <app>` | Restart an installed app |
| `library:update <app>` | Update an app to the latest image version |
| `library:cleanup <app> [--force]` | Remove an installed app and its resources |

### Checkout Options

| Option | Description |
|---|---|
| `--name=<name>` | Custom app name (default: manifest name) |
| `--domain=<domain>` | Custom domain |
| `--no-ssl` | Skip Let's Encrypt SSL setup |
| `--no-mail` | Skip mail service setup |
| `--no-auth` | Skip auth/SSO setup |
| `--auth-service=<name>` | Specific auth service to use |
| `--non-interactive` | Use defaults without prompting |

## Available Apps

| App | Database | Description |
|---|---|---|
| [Bookstack](https://www.bookstackapp.com/) | MariaDB | Documentation/wiki platform |
| [Ghost](https://ghost.org/) | MariaDB | Professional publishing platform |
| [Gitea](https://gitea.io/) | PostgreSQL | Lightweight Git hosting |
| [Grafana](https://grafana.com/) | PostgreSQL | Observability dashboards |
| [Jellyfin](https://jellyfin.org/) | -- | Media server |
| [Linkding](https://github.com/sissbruecker/linkding) | PostgreSQL | Bookmark manager |
| [Mealie](https://mealie.io/) | PostgreSQL | Recipe manager |
| [Miniflux](https://miniflux.app/) | PostgreSQL | Minimalist RSS reader |
| [Outline](https://www.getoutline.com/) | PostgreSQL + Redis | Team wiki/knowledge base |
| [Paperless-ngx](https://docs.paperless-ngx.com/) | PostgreSQL + Redis | Document management |
| [Radarr](https://radarr.video/) | -- | Movie collection manager |
| [Sonarr](https://sonarr.tv/) | -- | TV series collection manager |
| [Uptime Kuma](https://uptime.kuma.pet/) | -- | Uptime monitoring |
| [Vaultwarden](https://github.com/dani-garcia/vaultwarden) | PostgreSQL | Bitwarden-compatible password manager |

## Manifest Format

Each app has a `library/<app>/manifest.yml` with the following structure:

```yaml
library:
  description: Short description
  url: https://app-homepage.com
  prompts:
    - key: DOMAIN
      question: Domain for the app
      default: app.%HOSTNAME%
  connection_env:          # optional — post-deploy DB URL parsing
    service: db
    type: postgres         # postgres | mariadb | redis
    mode: prefix           # prefix | map | env
    prefix: "DB"
    separator: "_"
    case: upper

services:
  db:
    type: postgres

apps:
  app-name:
    image: org/image:tag
    domains: ["%DOMAIN%"]
    links:
      postgres: db
    env:
      KEY: value
    ports:
      - "http:80:3000"
    storage:
      - "/var/lib/dokku/data/app:/data"
    letsencrypt: true
```

### Template Variables

| Variable | Replaced With |
|---|---|
| `%DOMAIN%` | Resolved domain name |
| `%APP_NAME%` | App name |
| `%HOSTNAME%` | Server hostname |
| `%SECRET%` | Random 32-byte hex string |
| `%SECRET_BASE64_32%` | Random 32-byte base64 string |

### Connection Env Modes

When an app needs individual database connection variables instead of a single `DATABASE_URL`:

- **`prefix`** — Generates `prefix__host`, `prefix__port`, etc. Configurable separator and case.
- **`map`** — Maps URL components to arbitrary env var names via a YAML map.
- **`env`** — Copies the URL to a different env var name, optionally rewriting the scheme.

## Adding a New App

1. Create `library/<app-name>/manifest.yml` following the format above
2. Add a test spec at `tests/e2e/<app-name>.spec.ts`
3. Add a job entry in `.github/workflows/ci.yml`
4. Run `dokku library:checkout <app-name> --non-interactive` to test locally

## License

[MIT](LICENSE)
