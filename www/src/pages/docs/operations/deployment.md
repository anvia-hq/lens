---
layout: ../../../layouts/DocsLayout.astro
title: Deployment
description: Run the production Compose stack securely with persistent data and health checks.
eyebrow: Operations
---

The supported production starting point is `docker-compose.yml` using published multi-platform Lens
images.

## Service architecture

| Service | Responsibility | Host exposure |
| --- | --- | --- |
| `web` | Browser application and reverse proxy to the API | `WEB_PORT`, default 80 |
| `api` | Authentication, product APIs, and OTLP ingestion | Private Compose network |
| `worker` | Ingestion, materialization, retention, deletion, and cost jobs | Private Compose network |
| `postgres` | Identity, projects, settings, datasets, and job state | Private Compose network |
| `clickhouse` | Traces, spans, run telemetry, results, and analytics | Private Compose network |
| `redis` | Durable queue transport | Private Compose network |
| `migrate` | Applies database migrations before API startup | One-shot private service |

The API waits for migrations and Redis; the web service waits for API readiness. The worker uses a
graceful stop period to finish or safely return work.

## Prepare configuration

Download `docker-compose.yml` and `.env.example`, set one public HTTPS origin, and generate a unique
value for every required secret. Pin `LENS_VERSION` instead of using `latest` when repeatable
deployments matter.

```sh
docker compose pull
docker compose up -d
docker compose ps
```

## Put Lens behind HTTPS

For internet access, terminate TLS in a reverse proxy or load balancer and forward traffic to the
web service only. Set both `PUBLIC_APP_URL` and `WEB_ORIGIN` to that exact browser-facing origin,
including scheme and non-default port when applicable.

Do not publish PostgreSQL, ClickHouse, Redis, the API, or the worker directly to the internet.

## Persist and protect data

The production Compose file uses `lens-postgres`, `lens-clickhouse`, and `lens-redis` named volumes.
Include all three in operational backups. Protect the Compose environment file because it contains
database passwords, authentication secrets, and the ingestion-key pepper.

Read [Upgrades and backups](/docs/operations/upgrades/) before replacing a running version.

## Check health

The API exposes live and ready checks internally. The web container also exposes a live endpoint for
its container health check. Use Compose status and logs as the supported first-line checks:

```sh
docker compose ps
docker compose logs -f api worker web
```

The API is ready only after PostgreSQL, ClickHouse, Redis, and migrations are usable.

## Stop without deleting data

```sh
docker compose down
```

This preserves named volumes. Do not add `-v` unless permanent deletion of all Lens data is the
explicit goal.
