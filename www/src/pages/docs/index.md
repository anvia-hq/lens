---
layout: ../../layouts/DocsLayout.astro
title: Anvia Lens documentation
description: Learn how to deploy, connect, observe, evaluate, and operate Anvia Lens.
eyebrow: Documentation
---

Anvia Lens is a self-hosted workspace for understanding and improving production AI agents. It
collects OpenTelemetry traces, connects related requests into sessions and users, and brings
evaluation runs, datasets, comparisons, and release gates into the same project.

If this is your first visit, start with [Getting started](/docs/getting-started/). You will deploy a
local Lens stack, create a project, connect an application, and confirm that its first trace arrived.

## Run a concrete example

After creating a project key and configuring `examples/anvia-agent/.env` in a source checkout, use
these commands as a hands-on path:

| Command | Expected result in Lens |
| --- | --- |
| `pnpm example:anvia` | One agent request in **Traces** |
| `pnpm example:anvia:context` | The trace grouped under **Sessions** and **Users** |
| `pnpm example:anvia:tools` | Agent, generation, and tool observations in one trace |
| `pnpm example:anvia:eval` | A completed evaluation run with case results and trace links |
| `pnpm example:anvia:release` | Compatible baseline and candidate runs for **Compare** |

The [example setup and complete sources](https://github.com/anvia-hq/lens/tree/main/examples/anvia-agent)
use synthetic support data and a live OpenAI-compatible model.

## Choose a path

### I am setting up Lens

Follow [Getting started](/docs/getting-started/) for a local installation. Before exposing it to a
team or the internet, review [Deployment](/docs/operations/deployment/) for HTTPS, networking,
persistent data, and health checks, then use [Configuration](/docs/operations/configuration/) as the
environment-variable reference.

### I am connecting an application

Use the [Anvia Lens SDK](/docs/connect/anvia/) for native Anvia agents and evaluations. Existing
Langfuse OpenTelemetry v5 applications can use the [Langfuse integration](/docs/connect/langfuse/)
without replacing their current instrumentation.

### I am investigating production behavior

Begin with the [Overview](/docs/observability/) dashboard, then use
[Traces](/docs/observability/traces/), [Sessions](/docs/observability/sessions/), and
[Users](/docs/observability/users/) to narrow an investigation. Open [Trace details](/docs/observability/trace-detail/)
when you need the exact model call, tool invocation, payload, or error behind a high-level signal.

### I am building an evaluation workflow

Start with [What to evaluate](/docs/evaluations/what-to-evaluate/) to turn product failures into
cases and metrics. Then follow the [Evaluation workflow](/docs/evaluations/) and learn how to use
[Runs](/docs/evaluations/runs/), [Datasets](/docs/evaluations/datasets/),
[Compare](/docs/evaluations/compare/), and [Quality gates](/docs/evaluations/gates/).

### I administer the workspace

Use [Projects](/docs/management/projects/) to isolate telemetry, manage access through
[Members and roles](/docs/management/members/), and control keys and retention in
[Project settings](/docs/management/project-settings/).

## Product areas

| Area | Use it to |
| --- | --- |
| Observability | Inspect activity, payloads, latency, token use, errors, sessions, users, and cost. |
| Evaluations | Review test runs and results, manage datasets, compare candidates, and apply gates. |
| Management | Create projects, control workspace access, rotate credentials, and set retention. |
| Operations | Deploy, configure, upgrade, back up, and troubleshoot a self-hosted installation. |

## How data reaches Lens

1. Your application instruments an agent through `@anvia/lens` or a supported OpenTelemetry
   integration.
2. The SDK batches spans and sends them to the Lens API with a project key pair.
3. The API authenticates the request and places ingestion work on Redis.
4. The worker normalizes the telemetry and writes trace and evaluation data to ClickHouse.
5. The web application queries the selected project and presents traces, sessions, results, and
   aggregates.

The application process must flush before a short-lived script exits. Otherwise, spans still in the
exporter's buffer may never reach the API.

## What Lens stores

Lens keeps identity, projects, configuration, managed datasets, and workspace state in PostgreSQL.
High-volume traces and evaluation telemetry live in ClickHouse. Redis backs queues used by the API
and worker. All three services hold operationally important state and should be included in backups.
Review [Core concepts](/docs/concepts/) for the product data model and
[Deployment](/docs/operations/deployment/) for the service architecture.
