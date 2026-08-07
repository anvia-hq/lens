# Anvia Lens

Anvia Lens is an OpenTelemetry-native quality and trace explorer for AI agents. Native Anvia apps
use `@anvia/lens` for safe-by-default tracing and correlated evaluation reporting. Existing
Langfuse applications can point an `@langfuse/otel` v5 processor at Lens by changing its base URL
and API keys.

Lens turns OTLP/HTTP traces and standard `gen_ai.evaluation.result` log events into project-scoped
trace timelines, session/user views, latency/token analytics, and an evaluation dashboard grouped
by metric, suite, environment, and release.

Native Anvia evaluation lifecycle events also create first-class runs. Completed runs from the same
suite and environment can be compared across releases, including quality, p95 latency, and token
deltas. Owners and admins can save named quality gates and apply them during a comparison.

## Stack

- Hono API and BullMQ worker on Node.js 24
- React, Vite, Tailwind CSS, TanStack Query/Router
- PostgreSQL for users, membership, projects, and ingestion keys
- ClickHouse for spans and trace summaries
- Redis for durable ingestion jobs and rate limits
- Better Auth for invitation-only email/password sessions and membership

## UI system

Reusable UI primitives live in `packages/ui`. The package contains the complete shadcn Base UI
registry using the default Nova style, neutral semantic theme tokens, Tailwind CSS v4, and Solar
icons. The web app imports components through `@lens/ui/components/*` and the generated global
theme through `@lens/ui/globals.css`.

Anvia Lens-specific pages use standard Tailwind utilities and shadcn semantic colors. Keep application
CSS, arbitrary utility values, and custom color tokens out of `apps/web`. To refresh the complete
registry from the web workspace configuration, run:

```sh
pnpm dlx shadcn@latest add --all --overwrite -c apps/web -y
```

## Deploy with Docker Compose

The default [`docker-compose.yml`](docker-compose.yml) is the self-hosted deployment artifact. It
pulls versioned backend and web images from GitHub Container Registry, runs migrations before the
API starts, keeps PostgreSQL, ClickHouse, and Redis private to the Compose network, and persists all
three data stores in named volumes.

```sh
cp .env.example .env
# Set the public origin and replace every replace-with-* value in .env.
docker compose up -d
```

Open the URL configured in `PUBLIC_APP_URL`. Only the Lens web port is published. For an
internet-facing installation, place port 80 behind an HTTPS reverse proxy or load balancer and set
`PUBLIC_APP_URL` and `WEB_ORIGIN` to that HTTPS origin. Pin `LENS_VERSION` to a release instead of
`latest` for repeatable deployments.

Generate URL-safe deployment secrets with `openssl rand -hex 32`. `BETTER_AUTH_SECRET` and
`INGESTION_KEY_PEPPER` must remain stable after the first deployment: changing them invalidates
sessions or ingestion-key verification. SMTP is optional and is used only for password-reset
emails; invitations continue to use copyable links.

Upgrade by changing `LENS_VERSION`, then let Compose pull the release and run its migrations:

```sh
docker compose pull
docker compose up -d
```

Back up the `lens-postgres`, `lens-clickhouse`, and `lens-redis` volumes before an upgrade. Do not
run multiple Lens releases against the same databases during a rolling upgrade.

Release tags matching `v*.*.*` publish multi-platform backend and web images through
[`publish-images.yml`](.github/workflows/publish-images.yml). After the first publication, a
repository owner must make both GHCR packages public so self-hosted users can pull them without a
GitHub token.

## Start locally

The development Compose file builds the current checkout, exposes infrastructure ports, and adds
Mailpit:

```sh
cp .env.dev.example .env
# Replace BETTER_AUTH_SECRET and INGESTION_KEY_PEPPER in .env.
docker compose -f docker-compose.dev.yml up --build
```

Open Anvia Lens at <http://localhost> and Mailpit at <http://localhost:8025>. Development host ports
are overridable through `WEB_PORT`, `API_PORT`, `POSTGRES_PORT`, `REDIS_PORT`,
`CLICKHOUSE_HTTP_PORT`, `CLICKHOUSE_NATIVE_PORT`, `SMTP_PORT`, and `MAILPIT_UI_PORT`. When changing
the web port, set `PUBLIC_APP_URL` and `WEB_ORIGIN` to the same browser-facing URL.

### Realistic demo data

With the Compose stack running, seed a verified demo account, project, API key pair,
and 24 hours of realistic AI agent telemetry:

```sh
docker compose -f docker-compose.dev.yml run --rm seed
```

The command is safe to rerun: it refreshes only the dedicated demo project. Sign in with
`demo@lens.local` and password `LensDemo2026!`. The seed includes 64 traces and 448 agent,
generation, and tool spans across support, billing, incident response, research, and risk
workloads. It prints the reusable demo public and secret keys when it completes.

## Projects and members

Anvia Lens is the workspace, so there is no workspace setup or switching. On an empty installation,
the first person creates the owner account from the sign-in screen. Public registration closes as
soon as that account exists.

The root page is the project selector. Choose a project there to open its overview, traces,
sessions, connection guide, and project settings. The **Members** page manages access. Owners and
admins create seven-day invitation links for member or admin roles, then copy and share those links
directly. No invitation email is sent. The invited person opens the link, enters their name and a
password, and receives their account and membership in one step. Invitations are single-use.

Every account can have only one membership. Member access is read-only for membership management,
while admins can manage projects and members. SMTP remains available for password-reset messages.

For application development with infrastructure in containers:

```sh
docker compose -f docker-compose.dev.yml up -d postgres redis clickhouse mailpit
pnpm install
pnpm db:migrate
pnpm dev
```

## Connect a native Anvia application

Create a project key pair in Anvia Lens, then configure the native package:

```sh
ANVIA_LENS_BASE_URL=http://localhost
ANVIA_LENS_PUBLIC_KEY=pk-lens-...
ANVIA_LENS_SECRET_KEY=sk-lens-...
ANVIA_LENS_SERVICE_NAME=support-agent
ANVIA_LENS_ENVIRONMENT=development
```

```ts
import { createLensEvalReporter, lens } from "@anvia/lens";

export const tracing = lens.create();
export const evalReporter = createLensEvalReporter(tracing);
```

Pass `tracing` to an agent with `.observe(tracing)` and `evalReporter` to `runEvalSuite`. Lens uses
isolated OpenTelemetry providers, so it does not register global providers or capture unrelated
application telemetry.

The [native Anvia examples](examples/anvia-agent/README.md) provide a runnable live-model learning
path from a first trace through tool calls, evaluation runs, LLM judges, comparisons, and gates.

## Send Langfuse OTLP traces

Create a project key pair in Anvia Lens and configure the standard Langfuse environment variables.
The base URL is the Lens origin; `@langfuse/otel` appends the ingestion path itself:

```sh
LANGFUSE_BASE_URL=http://localhost
LANGFUSE_PUBLIC_KEY=pk-lens-...
LANGFUSE_SECRET_KEY=sk-lens-...
LANGFUSE_MEDIA_UPLOAD_ENABLED=false
```

Existing `@langfuse/otel` instrumentation then works unchanged:

```ts
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { startObservation } from "@langfuse/tracing";
import { NodeSDK } from "@opentelemetry/sdk-node";

const sdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor()],
});
sdk.start();

const agent = startObservation("support-agent", {}, { asType: "agent" });
agent.end();
```

The same variables work with `@anvia/langfuse`. Short-lived processes must flush or shut down their
OpenTelemetry SDK before exiting. Lens does not implement Langfuse media storage yet, so applications
that may capture base64 media should keep `LANGFUSE_MEDIA_UPLOAD_ENABLED=false`.

## Commands

```sh
pnpm dev        # API, worker, and web app
pnpm typecheck  # TypeScript checks across the workspace
pnpm test       # Unit tests
pnpm test:integration # Isolated PostgreSQL, ClickHouse, and Redis package tests
pnpm verify:packages  # Complete package quality gate, including coverage and builds
pnpm build      # Production builds
pnpm check      # Biome formatting and lint checks
pnpm db:migrate # PostgreSQL and ClickHouse migrations
pnpm db:seed    # Seed realistic demo data against configured databases
```

Anvia Lens accepts OTLP/HTTP traces and logs in protobuf or JSON, with optional gzip. Log ingestion
currently retains evaluation result events and ignores unrelated application logs. Metrics,
OTLP/gRPC, media objects, public trace-read keys, prompt management, server-side evaluation
execution, automatic gate evaluation, CI commands, and cost calculation are outside the current
release.

## Managed datasets

The **Evaluations → Datasets** workspace separates authored **Managed** datasets from immutable
**Observed** snapshots reconstructed from evaluation runs. Owners and admins can create a draft,
edit or JSONL-import cases, publish an immutable version, clone the latest published version, and
archive a dataset. Complete conflict-free Observed snapshots can be copied into a managed draft.

Published versions are available to SDKs through the Langfuse-compatible read endpoint:

```http
GET /api/public/datasets/:name?version=v1&page=1&limit=50
Authorization: Basic base64(publicKey:secretKey)
```

Omit `version` to read the latest published version. Drafts and archived datasets are never exposed
through the public endpoint.
