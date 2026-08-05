# Lens

Lens is an OpenTelemetry-native trace explorer for AI agents. It accepts standard OTLP/HTTP
traces, enriches spans emitted by `@anvia/otel` and standard `gen_ai.*` instrumentation, and
turns them into project-scoped trace timelines, session/user views, and latency/token analytics.

## Stack

- Hono API and BullMQ worker on Node.js 24
- React, Vite, Tailwind CSS, TanStack Query/Router
- PostgreSQL for users, teams, projects, and ingestion keys
- ClickHouse for spans and trace summaries
- Redis for durable ingestion jobs and rate limits
- Better Auth for email/password sessions and team membership

## UI system

Reusable UI primitives live in `packages/ui`. The package contains the complete shadcn Base UI
registry using the default Nova style, neutral semantic theme tokens, Tailwind CSS v4, and Lucide
icons. The web app imports components through `@lens/ui/components/*` and the generated global
theme through `@lens/ui/globals.css`.

Lens-specific pages use standard Tailwind utilities and shadcn semantic colors. Keep application
CSS, arbitrary utility values, and custom color tokens out of `apps/web`. To refresh the complete
registry from the web workspace configuration, run:

```sh
pnpm dlx shadcn@latest add --all --overwrite -c apps/web -y
```

## Start locally

The complete stack runs through Docker Compose:

```sh
cp .env.example .env
# Replace BETTER_AUTH_SECRET and INGESTION_KEY_PEPPER in .env.
docker compose up --build
```

Open Lens at <http://localhost> and Mailpit at <http://localhost:8025>.
Host ports are overridable through `WEB_PORT`, `API_PORT`, `POSTGRES_PORT`, `REDIS_PORT`,
`CLICKHOUSE_HTTP_PORT`, `CLICKHOUSE_NATIVE_PORT`, `SMTP_PORT`, and `MAILPIT_UI_PORT`. When changing
the web port, set `PUBLIC_APP_URL` and `WEB_ORIGIN` to the same browser-facing URL.

### Realistic demo data

With the Compose stack running, seed a verified demo account, project, ingestion key,
and 24 hours of realistic Anvia agent telemetry:

```sh
docker compose run --rm seed
```

The command is safe to rerun: it refreshes only the dedicated demo project. Sign in with
`demo@lens.local` and password `LensDemo2026!`. The seed includes 64 traces and 448 agent,
generation, and tool spans across support, billing, incident response, research, and risk
workloads. It prints the reusable demo ingestion key when it completes.

## Projects and teams

Every account uses one automatically managed team, so there is no workspace setup or switching.
The root page is the project selector. Choose a project there to open its overview, traces,
sessions, connection guide, and project settings. The selector also creates projects and its
**Team** tab manages teammates. Projects have independent telemetry, settings, and ingestion
keys. Owners and admins can invite teammates, assign member or admin roles, change roles, remove
members, and cancel pending invitations.

In development, invitation and verification messages are delivered to Mailpit. A teammate can
open the invitation link, create and verify an account if needed, then accept or decline the
invitation. Member access is read-only for team management, while admins can manage projects
and teammates.

For application development with infrastructure in containers:

```sh
docker compose up -d postgres redis clickhouse mailpit
pnpm install
pnpm db:migrate
pnpm dev
```

## Send Anvia traces

Create a project and ingestion key in Lens, then initialize OpenTelemetry before creating the
Anvia observer:

```ts
import { otel } from "@anvia/otel";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: "http://localhost:3000/v1/traces",
    headers: { Authorization: `Bearer ${process.env.LENS_INGESTION_KEY}` },
  }),
});
sdk.start();

export const tracing = otel.create({ serviceName: "support-agent" });
```

Use `tracing` with `.observe(tracing)` on an Anvia agent. Short-lived processes must shut down or
flush their OpenTelemetry SDK before exiting.

## Commands

```sh
pnpm dev        # API, worker, and web app
pnpm typecheck  # TypeScript checks across the workspace
pnpm test       # Unit tests
pnpm build      # Production builds
pnpm check      # Biome formatting and lint checks
pnpm db:migrate # PostgreSQL and ClickHouse migrations
pnpm db:seed    # Seed realistic demo data against configured databases
```

Lens v1 accepts OTLP traces in protobuf or JSON, with optional gzip. Logs, metrics, OTLP/gRPC,
public trace-read keys, scores, prompts, datasets, evaluations, and cost calculation are outside
the current release.
