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
| `monitor` | Read-only Linux host CPU, memory, uptime, and root-disk snapshot | Isolated internal network |
| `postgres` | Identity, projects, settings, datasets, and job state | Private Compose network |
| `clickhouse` | Traces, spans, run telemetry, results, and analytics | Private Compose network |
| `redis` | Durable queue transport | Private Compose network |
| `migrate` | Applies database migrations before API startup | One-shot private service |

The API waits for migrations and Redis; the web service waits for API readiness. The worker uses a
graceful stop period to finish or safely return work.

The monitor is informational and does not block Lens startup. It runs without application or
database secrets, Linux capabilities, or access to the Docker socket. Production Compose mounts the
host root and `/proc` read-only and exposes the monitor only to the API over an isolated network.
Custom deployments may omit it; System Health will continue to show Lens services and report that
machine metrics are not configured.

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

For Nginx and Certbot installed directly on the Docker host, bind Lens to a private host port in
`.env` so Nginx can own public ports 80 and 443:

```dotenv
PUBLIC_APP_URL=https://lens.example.com
WEB_ORIGIN=https://lens.example.com
WEB_PORT=127.0.0.1:8080
```

Configure the host Nginx to forward the public domain to Lens:

```nginx
server {
    listen 80;
    server_name lens.example.com;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

After enabling that site, reload Nginx and let Certbot add the HTTPS listener and certificate:

```sh
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d lens.example.com
```

Restart Lens after changing `.env` and confirm both layers are healthy:

```sh
docker compose up -d
docker compose ps
curl -I https://lens.example.com
```

```text
Internet :443 → host Nginx → Lens web 127.0.0.1:8080 → private API :3001
```

The host Nginx does not listen on port 8080; it connects to Lens there.

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

Owners and admins can also open **System Health** in the workspace navigation. It refreshes every
15 seconds and shows current Linux host CPU, RAM, swap, root-disk space, ClickHouse disk capacity,
database sizes, Redis memory, worker heartbeat, and queue counts. Resource levels become warnings
at 80% usage (85% for CPU) and critical at 90% usage (95% for CPU).

## Stop without deleting data

```sh
docker compose down
```

This preserves named volumes. Do not add `-v` unless permanent deletion of all Lens data is the
explicit goal.
