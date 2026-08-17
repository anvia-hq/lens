---
layout: ../../../layouts/DocsLayout.astro
title: Configuration
description: Reference the supported production image, origin, secret, email, and ingestion settings.
eyebrow: Operations
---

Production Compose reads `.env` beside `docker-compose.yml`. Restart affected services after
changing runtime configuration.

This page is a reference for operators. For a first installation, follow
[Getting started](/docs/getting-started/) so the variables are introduced in the order you need
them.

After editing `.env`, reconcile the running containers so Compose applies the new values:

```sh
docker compose up -d
docker compose ps
```

Changing the file alone does not update environment variables inside an already-running container.

## Images and web origin

| Variable | Default | Purpose |
| --- | --- | --- |
| `LENS_VERSION` | `latest` | Backend and web image tag. Pin a release for repeatable deployments. |
| `LENS_PULL_POLICY` | `always` | Compose image pull behavior. |
| `LENS_BACKEND_IMAGE` | `ghcr.io/anvia-hq/lens` | Optional backend image override. |
| `LENS_WEB_IMAGE` | `ghcr.io/anvia-hq/lens-web` | Optional web image override. |
| `PUBLIC_APP_URL` | Required | Browser-facing absolute origin used by authentication and generated links. |
| `WEB_ORIGIN` | Required | Allowed browser origin. Set it to the same public origin. |
| `WEB_PORT` | `80` | Host binding published by the web container, such as `80` or `127.0.0.1:8080`. |
| `SYSTEM_MONITOR_URL` | Empty outside production Compose | Internal compatible host collector URL. Production Compose configures this automatically. |
| `SYSTEM_MONITOR_DATA_PATH` | `/var/lib/docker` | Host directory containing Docker volumes. Set this to Docker's data root or the dedicated data-disk mount. |

Use `https://lens.example.com`, not an internal API or Compose service URL, for both origin values.
The two values must match exactly. A mismatch commonly appears as a sign-in, redirect, cookie, or
cross-origin request failure.

`SYSTEM_MONITOR_URL` is not normally added to `.env`. The production Compose file connects the API
to its bundled Linux monitor on an isolated network. Kubernetes and custom deployments can provide
a compatible collector URL or leave it unset; the rest of Lens remains healthy without machine
metrics.

Production Compose monitors the root filesystem and `SYSTEM_MONITOR_DATA_PATH`. Find Docker's data
root with `docker info --format '{{.DockerRootDir}}'`. If named volumes live on a dedicated mount,
set the variable to that absolute host path and run `docker compose up -d` to recreate the monitor.
Lens displays the two filesystems separately and automatically removes the duplicate when both paths
resolve to the same filesystem.

## Required secrets

| Variable | Purpose |
| --- | --- |
| `POSTGRES_PASSWORD` | Password for the Lens PostgreSQL user. |
| `CLICKHOUSE_PASSWORD` | Password for the Lens ClickHouse user. |
| `REDIS_PASSWORD` | Redis authentication password. |
| `BETTER_AUTH_SECRET` | Authentication signing secret; use at least 32 random characters. |
| `INGESTION_KEY_PEPPER` | Independent secret used to hash project ingestion secrets. |

Generate a different random value for every entry:

```sh
openssl rand -hex 32
```

Changing database passwords requires coordinated changes to the stored database credentials.
Changing the ingestion-key pepper invalidates verification of existing project secret keys, so
rotate project keys deliberately if the pepper must change.

Do not reuse one generated value for all five settings. Separate secrets limit the impact of a
single credential disclosure and allow each subsystem to be rotated independently.

## Email

| Variable | Default | Purpose |
| --- | --- | --- |
| `SMTP_HOST` | Empty | SMTP server; empty disables email delivery. |
| `SMTP_PORT` | `587` | SMTP port. |
| `SMTP_SECURE` | `false` | Enable a secure SMTP connection where required. |
| `SMTP_USER` | Empty | SMTP username. |
| `SMTP_PASSWORD` | Empty | SMTP password. |
| `SMTP_FROM` | `Anvia Lens <lens@localhost>` | Sender displayed on Lens email. |

SMTP is optional and is wired for password-reset delivery. Invitations use copyable links and do
not require email.

Set `SMTP_SECURE=true` only when the SMTP connection starts with TLS, commonly on port 465. For
servers that upgrade the connection with STARTTLS, commonly on port 587, keep it `false` unless the
provider says otherwise. `SMTP_USER` and `SMTP_PASSWORD` must either both be set or both be empty.

## Ingestion limits and logging

| Variable | Default | Purpose |
| --- | --- | --- |
| `OTLP_MAX_BODY_BYTES` | `10485760` | Maximum accepted OTLP request body in bytes. |
| `OTLP_RATE_LIMIT_PER_MINUTE` | `600` | Per-credential OTLP request limit per minute. |
| `LOG_LEVEL` | `info` | Application log verbosity. |

Increase ingestion limits only after measuring request shape and infrastructure capacity. Prefer
smaller exporter batches to an unnecessarily large public request limit.

`OTLP_RATE_LIMIT_PER_MINUTE` is evaluated per ingestion credential. Increasing it can raise API,
queue, and ClickHouse load; decreasing it may cause exporters to retry more often. Review API and
worker logs after changing either ingestion limit.
