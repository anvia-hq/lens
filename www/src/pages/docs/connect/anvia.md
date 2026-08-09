---
layout: ../../../layouts/DocsLayout.astro
title: Connect the Anvia Lens SDK
description: Send native Anvia traces and evaluation lifecycle events to a Lens project.
eyebrow: Connect
---

The `@anvia/lens` package provides native tracing for Anvia agents and a reporter that connects
evaluation runs to their cases, results, and traces.

By the end of this guide, ordinary agent requests will appear in **Traces**, related requests can be
grouped under **Sessions** and **Users**, and evaluation cases can link to the traces they produced.

## Before you begin

You need a running Lens installation, a project, and an active project ingestion key. You also need
an application that uses the Anvia agent SDK. If Lens is not running yet, complete
[Getting started](/docs/getting-started/) first.

Install the integration in your application:

```sh
pnpm add @anvia/lens
```

## Example: connect a support agent

The repository includes a complete support agent with synthetic prompts. From a source checkout,
copy and configure its environment file, then run the first example:

```sh
cp examples/anvia-agent/.env.example examples/anvia-agent/.env
pnpm example:anvia
```

The command prints the model response and its trace ID. Open that ID in **Traces**.

**Expected result:** the trace contains a named agent and model generation with status, duration,
model, and token data. Because this synthetic example enables full capture, its prompt and response
are also visible. Keep safe capture for real sensitive traffic unless payload export is approved.

See the [complete basic tracing source](https://github.com/anvia-hq/lens/blob/main/examples/anvia-agent/01_basics/01-basic-tracing.ts).

## 1. Configure project credentials

Open the target project’s **Connect** or **Settings** page and create an ingestion key. Copy the
generated values into the server-side environment of the application that runs your agent:

```dotenv
ANVIA_LENS_BASE_URL=https://lens.example.com
ANVIA_LENS_PUBLIC_KEY=pk-lens-...
ANVIA_LENS_SECRET_KEY=sk-lens-...
ANVIA_LENS_SERVICE_NAME=support-agent
ANVIA_LENS_ENVIRONMENT=production
```

| Variable | Meaning |
| --- | --- |
| `ANVIA_LENS_BASE_URL` | Browser-facing Lens origin. Do not append `/api` or an OTLP path. |
| `ANVIA_LENS_PUBLIC_KEY` | Identifies the Lens project that receives telemetry. |
| `ANVIA_LENS_SECRET_KEY` | Authenticates ingestion. Keep it out of source control and client code. |
| `ANVIA_LENS_SERVICE_NAME` | Stable name for the instrumented application or service. |
| `ANVIA_LENS_ENVIRONMENT` | Deployment stage, such as `development`, `staging`, or `production`. |

The public and secret keys must come from the same active key pair. A key belongs to exactly one
project, so telemetry cannot be moved between projects merely by changing a filter in the UI.

## 2. Initialize tracing once

Create one tracing instance during application startup and reuse it for the lifetime of the
process. Reusing it lets the exporter batch spans efficiently and gives shutdown one place to flush
pending data.

```ts
import { createLensEvalReporter, lens } from "@anvia/lens";

export const tracing = lens.create();
export const evalReporter = createLensEvalReporter(tracing);
```

Attach the tracing instance before building an Anvia agent:

```ts
const supportAgent = new AgentBuilder("support-agent", model)
  .name("Support agent")
  .observe(tracing)
  .build();
```

Agent activity is exported as an OpenTelemetry trace with typed observations for agents,
generations, tools, and other work inside the run.

## 3. Add trace context

Add context to a request when you want Lens to group or filter it:

```ts
const response = await supportAgent
  .prompt("Summarize ticket TICKET-1001")
  .withTrace({
    name: "support-ticket-summary",
    userId: "customer_42",
    sessionId: "ticket_1001",
    tags: ["support", "summary"],
    version: "v2",
    metadata: { ticketId: "TICKET-1001" },
  })
  .send();
```

- `userId` connects traces to the Users explorer.
- `sessionId` groups related traces into a session or conversation.
- `environment` separates production, staging, and development activity; set it in configuration
  when it applies to the entire process.
- `release` identifies the deployed build and evaluation release context; a Git SHA or immutable
  version works well.
- `tags` provide flexible filtering dimensions.
- `metadata` adds structured investigation context without changing the core schema.

Use identifiers from your application. Avoid putting personal or secret data into tags because
tags are designed to be searchable.

Run `pnpm example:anvia:context` for the complete version of this request. Search
`example-session-1001` in **Sessions** or `example-user-42` in **Users** to verify the grouping.

## 4. Capture payloads safely

Safe capture is the default. It exports trace structure, timing, status, model, and token data but
omits prompt and response payloads. This is the right starting point for applications that may
process personal, regulated, or secret data.

Enable full capture only when those payloads are approved for export:

```ts
const tracing = lens.create({ captureMode: "full" });
```

Full capture makes formatted input and output available in trace, session, and evaluation detail
views. Before enabling it in production:

1. Redact secrets and unnecessary personal data in the application.
2. Confirm that access to the Lens project is appropriately restricted.
3. Choose a project retention period that matches the data policy.
4. Test with synthetic input and inspect the exported payload before sending production traffic.

## 5. Report evaluations

Create the reporter from the same tracing instance used by the evaluated agent, then pass it to the
suite:

```ts
await runEvalSuite({
  // suite, cases, evaluators, and runner configuration
  reporters: [evalReporter],
});
```

The reporter emits run lifecycle, case, metric, dataset, environment, and release information. It
also correlates each case with the trace produced while the case ran. Using a different tracing
instance or evaluating an unobserved target can leave a result without trace coverage.

## 6. Flush before exit

Export happens in batches. A long-running server should call `shutdown()` from its graceful
termination path. A short-lived script should flush after its final request and always shut down:

```ts
try {
  await supportAgent.prompt("Hello").send();
  await tracing.flush();
} finally {
  await tracing.shutdown();
}
```

`flush()` waits for currently buffered telemetry while keeping the instance usable. `shutdown()`
performs the final delivery and releases exporter resources; do not send new work through that
instance afterward.

## Verify the connection

Run one request, open **Traces**, select the 24-hour range, and clear any active filters. Open the
new trace and confirm its observation tree is present. If you supplied `userId` or `sessionId`, the
same activity should also be reachable from **Users** or **Sessions**.

If the trace never appears, follow [Telemetry is not appearing](/docs/operations/troubleshooting/#telemetry-is-not-appearing).

Next, verify the data in [Traces](/docs/observability/traces/) or choose cases and metrics in
[What to evaluate](/docs/evaluations/what-to-evaluate/) before beginning the
[Evaluation workflow](/docs/evaluations/).
