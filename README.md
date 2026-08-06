# Anvia Lens

Anvia Lens is a Langfuse-compatible, OpenTelemetry-native trace explorer for AI agents. Point an
`@langfuse/otel` v5 processor at Lens by changing its base URL and API keys. Lens accepts the
processor's OTLP/HTTP traces and turns the full Langfuse observation taxonomy into project-scoped
trace timelines, session/user views, and latency/token analytics.

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

## Start locally

The complete stack runs through Docker Compose:

```sh
cp .env.example .env
# Replace BETTER_AUTH_SECRET and INGESTION_KEY_PEPPER in .env.
docker compose up --build
```

Open Anvia Lens at <http://localhost> and Mailpit at <http://localhost:8025>.
Host ports are overridable through `WEB_PORT`, `API_PORT`, `POSTGRES_PORT`, `REDIS_PORT`,
`CLICKHOUSE_HTTP_PORT`, `CLICKHOUSE_NATIVE_PORT`, `SMTP_PORT`, and `MAILPIT_UI_PORT`. When changing
the web port, set `PUBLIC_APP_URL` and `WEB_ORIGIN` to the same browser-facing URL.

### Realistic demo data

With the Compose stack running, seed a verified demo account, project, API key pair,
and 24 hours of realistic AI agent telemetry:

```sh
docker compose run --rm seed
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
docker compose up -d postgres redis clickhouse mailpit
pnpm install
pnpm db:migrate
pnpm dev
```

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
pnpm build      # Production builds
pnpm check      # Biome formatting and lint checks
pnpm db:migrate # PostgreSQL and ClickHouse migrations
pnpm db:seed    # Seed realistic demo data against configured databases
```

Anvia Lens accepts the Langfuse v5 OTLP endpoint in protobuf or JSON, with optional gzip. Logs,
metrics, OTLP/gRPC, media objects, public trace-read keys, scores, prompts, datasets, evaluations,
and cost calculation are outside the current release.
