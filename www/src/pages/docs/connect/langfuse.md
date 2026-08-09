---
layout: ../../../layouts/DocsLayout.astro
title: Connect Langfuse instrumentation
description: Send existing Langfuse OpenTelemetry v5 traces to Anvia Lens.
eyebrow: Connect
---

Lens accepts the OpenTelemetry trace format emitted by `@langfuse/otel` v5. Existing applications
can point their Langfuse environment variables at Lens without replacing their instrumentation.

This compatibility applies to trace ingestion. Lens is not a replacement endpoint for every
Langfuse product API; the exact boundary is described at the end of this page.

## Example outcome

The example below creates a `support-agent` observation with the input `{ "message": "Hello" }`.
After the SDK flushes, search for `support-agent` in **Traces**.

**Expected result:** Lens shows the observation name, agent type, hierarchy, timing, status, and
captured input supported by the Langfuse OpenTelemetry payload. Langfuse media and management API
operations do not appear because this connection covers trace ingestion only.

## Before you begin

You need a Lens project and ingestion key plus a Node.js application using the Langfuse v5
OpenTelemetry packages. Install the packages if they are not already present:

```sh
pnpm add @langfuse/otel @langfuse/tracing @opentelemetry/sdk-node
```

## 1. Configure the environment

Create a project ingestion key, then set the standard Langfuse variables:

```dotenv
LANGFUSE_BASE_URL=https://lens.example.com
LANGFUSE_PUBLIC_KEY=pk-lens-...
LANGFUSE_SECRET_KEY=sk-lens-...
LANGFUSE_MEDIA_UPLOAD_ENABLED=false
```

`LANGFUSE_BASE_URL` must be the browser-facing Lens origin. The public and secret keys must belong
to the same active project key. These variables also work with `@anvia/langfuse`.

> Lens does not currently implement Langfuse media storage. Keep media upload disabled.

## 2. Initialize OpenTelemetry

Configure the Langfuse span processor when the application starts:

```ts
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { startObservation } from "@langfuse/tracing";
import { NodeSDK } from "@opentelemetry/sdk-node";

const sdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor()],
});
sdk.start();

const agent = startObservation(
  "support-agent",
  { input: { message: "Hello" } },
  { asType: "agent" },
);
try {
  // Run the instrumented application work here.
} finally {
  agent.end();
}
```

Create one `NodeSDK` instance at process startup. Ending an observation closes its timing interval;
it does not guarantee that its buffered span has already reached Lens.

## 3. Flush during shutdown

Shut down the SDK during graceful application termination:

```ts
await sdk.shutdown();
```

This is essential for command-line jobs and tests because the process may otherwise exit before the
exporter sends its final batch.

## 4. Verify ingestion

Run one instrumented request and open **Traces**. The trace should retain the observation names,
types, hierarchy, model data, token usage, and supported Langfuse attributes exported by the SDK.

If authorization fails, confirm that the public and secret keys belong to the same project and that
the key has not been revoked. If there is no request in API logs, confirm that
`LANGFUSE_BASE_URL` resolves from the application host. See
[Troubleshooting](/docs/operations/troubleshooting/) for body-size, rate-limit, and networking
checks.

## Compatibility boundary

Lens is an OTLP ingestion target, not a drop-in implementation of every Langfuse product API.
Trace ingestion through the supported OpenTelemetry integration is compatible; Langfuse-specific
media APIs and unrelated management APIs are outside this integration.
