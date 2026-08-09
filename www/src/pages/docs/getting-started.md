---
layout: ../../layouts/DocsLayout.astro
title: Getting started
description: Deploy Anvia Lens, create the workspace owner and first project, then verify telemetry.
eyebrow: Introduction
---

This guide takes you from an empty machine to a working Lens project with its first trace. The local
path uses `http://localhost`; use an HTTPS origin and the production guidance when deploying for a
team.

## Before you begin

You need:

- Docker Engine or Docker Desktop with the `docker compose` command.
- `curl` and `openssl` in your shell.
- Enough capacity to run PostgreSQL, ClickHouse, Redis, the Lens API, worker, and web application.
- An Anvia application if you want to send a real trace during this guide.

Only the Lens web service needs a host port. Keep PostgreSQL, ClickHouse, Redis, the API, and the
worker on the private Compose network.

Confirm Compose is available:

```sh
docker compose version
```

## 1. Download the deployment files

Create a dedicated directory, then download the production Compose file and its environment
template:

```sh
mkdir lens && cd lens
curl -fsSLO https://raw.githubusercontent.com/anvia-hq/lens/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/anvia-hq/lens/main/.env.example -o .env
```

The second command intentionally saves `.env.example` as `.env`, which is the filename Compose reads
automatically.

## 2. Configure Lens

For a local installation, set both public-origin variables to `http://localhost`. For a hosted
installation, set both to the exact HTTPS origin users will open in their browsers. Do not use a
private container hostname for either value.

Replace every placeholder secret with a different random value. Run this command once per secret:

```sh
openssl rand -hex 32
```

At minimum, review these values in `.env`:

```dotenv
PUBLIC_APP_URL=http://localhost
WEB_ORIGIN=http://localhost
WEB_PORT=80

POSTGRES_PASSWORD=<unique-random-value>
CLICKHOUSE_PASSWORD=<unique-random-value>
REDIS_PASSWORD=<unique-random-value>
BETTER_AUTH_SECRET=<unique-random-value>
INGESTION_KEY_PEPPER=<unique-random-value>
```

`PUBLIC_APP_URL` and `WEB_ORIGIN` must match exactly, including scheme, hostname, and any non-default
port. Keep the ingestion-key pepper independent from the database and authentication secrets.

## 3. Start the stack

```sh
docker compose up -d
docker compose ps
```

`docker compose up -d` starts the services in the background. The first startup can take longer
while images download and database migrations run. Inspect status and application logs:

```sh
docker compose ps
docker compose logs --tail=100 migrate api worker web
```

The `migrate` service should exit successfully because it is a one-shot job. The long-running
services should become healthy. If they do not, use [Troubleshooting](/docs/operations/troubleshooting/#the-stack-does-not-become-healthy).

**Expected result:** `docker compose ps` reports healthy `postgres`, `redis`, `clickhouse`, `api`,
`worker`, and `web` services, while `migrate` has exited with code 0. Opening the configured public
URL shows either workspace setup or sign-in.

## 4. Create the workspace owner

Open `http://localhost` or your configured `PUBLIC_APP_URL`. When the installation has no
organization, Lens asks for a workspace name, email address, and password. This first account
becomes the workspace **owner** and can manage every project, member, key, and retention setting.
Public owner creation closes immediately after this step.

If the installation already has an owner, the same URL displays the sign-in screen instead.

## 5. Create a project and ingestion key

After bootstrap, Lens asks for the first project name and generates its slug automatically. A
project is the isolation boundary for telemetry, evaluation data, ingestion credentials, and
retention.

Open the project’s **Connect** or **Settings** page and create an ingestion key. Give it a
recognizable name such as `Local development` or `Production API`, so a future administrator knows
which application can be affected by revoking it.

Copy both values immediately:

- The public key identifies the project.
- The secret key authenticates ingestion and is displayed only once.

Treat the secret key as a credential. Store it in your application’s secret manager or local
`.env` file, never in source control or browser code.

## 6. Connect an Anvia application

Install `@anvia/lens` in the application that owns the agent, then configure the SDK with the Lens
origin and project credentials:

```sh
pnpm add @anvia/lens
```

```dotenv
ANVIA_LENS_BASE_URL=http://localhost
ANVIA_LENS_PUBLIC_KEY=pk-lens-...
ANVIA_LENS_SECRET_KEY=sk-lens-...
ANVIA_LENS_SERVICE_NAME=support-agent
ANVIA_LENS_ENVIRONMENT=development
```

`ANVIA_LENS_BASE_URL` is the same browser-facing origin you opened earlier. Do not append `/api`, an
OTLP endpoint, or a trailing credentials path.

```ts
import { lens } from "@anvia/lens";

export const tracing = lens.create();
```

Attach `tracing` to your agent with `.observe(tracing)`. New requests will appear in **Traces** as
soon as the SDK exports them. Safe capture is the default: trace structure and operational metrics
are exported, but prompt and response payloads are omitted. See [Capture payloads safely](/docs/connect/anvia/#4-capture-payloads-safely)
before enabling full capture.

For a short-lived script, shut tracing down in a `finally` block so buffered spans are delivered even
when the request fails:

```ts
try {
  await agent.prompt("Hello").send();
  await tracing.flush();
} finally {
  await tracing.shutdown();
}
```

## 7. Verify the first trace

1. Run one instrumented request in the connected application.
2. Open the project and select **Traces**.
3. Keep the time range at **24h**, clear filters, and refresh if the trace is not immediately visible.
4. Open the trace and confirm that its agent, generation, and tool observations appear in the span
   tree.
5. Select an observation and verify its duration, status, model, token data, and payload state.

If nothing appears, work through [Telemetry is not appearing](/docs/operations/troubleshooting/#telemetry-is-not-appearing).

**Expected result:** the trace explorer shows the request with its status, duration, and available
token data. The detail view shows an agent observation and its model generation. With safe capture,
the structure is visible while prompt and response payloads remain unavailable by design.

To reproduce this with the repository’s synthetic support agent, configure the
[example package](https://github.com/anvia-hq/lens/tree/main/examples/anvia-agent) and run:

```sh
pnpm example:anvia
```

## What you have now

You have a running Lens stack, its owner account, one isolated project, a revocable ingestion key,
and an application exporting traces. From here, production investigations and evaluation workflows
use the same project data.

## Next steps

- Read [Overview](/docs/observability/) to understand activity and cost data.
- Read [Traces](/docs/observability/traces/) to learn the explorer and trace detail views.
- Read [What to evaluate](/docs/evaluations/what-to-evaluate/) to choose useful cases and metrics,
  then follow the [Evaluation workflow](/docs/evaluations/).
- Review [Core concepts](/docs/concepts/) for the Lens data model.
