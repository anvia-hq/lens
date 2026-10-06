# Native Anvia Lens examples

This package is a runnable learning path for sending live Anvia agent traces and evaluations to a
local or hosted Anvia Lens instance. The seven learning-path examples call a real OpenAI-compatible
model; the offline regression test uses a synthetic model and a loopback OTLP collector.

## Supported baseline

Node.js 24 or later, with exact published SDK versions checked against npm on 2026-10-06:

| Package         | Version |
| --------------- | ------- |
| `@anvia/core`   | `1.6.1` |
| `@anvia/lens`   | `1.2.1` |
| `@anvia/openai` | `1.1.8` |
| `zod`           | `4.6.5` |

Zod meets Core 1.6.1's `^4.6.5` peer requirement; this example does not use the server workspace's
older Zod catalog entry. These versions are pinned together in this package and the workspace
lockfile. They are independent of the Lens server/image version. Choose a published Lens image release as described in the root
[deployment guide](../../README.md#run-with-docker-compose); do not infer image availability from an
SDK version or the repository manifest.

The examples use `new Agent({ ... })`, `observability.observers` with `primaryTrace: "lens"`,
`generate({ prompt, trace })`, and explicit response-outcome handling. Evaluations use
`AgentResponse`, `agentEvalTarget({ agent, request })`, `reporterErrorPolicy`, and `suite.cases`
totals. `LensClient` owns observers, reporters, dataset access, and telemetry cleanup. The old
`AgentBuilder`, `.observe()`, and `.prompt().send()` examples are no longer retained.

## Setup

Start Lens from the repository root:

```sh
docker compose -f docker-compose.dev.yml up -d
```

Create a project key pair from the Lens **Connect** page, then configure this example package:

```sh
cp examples/anvia-agent/.env.example examples/anvia-agent/.env
```

Set the `ANVIA_LENS_*` values to the Lens project credentials. Set `OPENAI_API_KEY`,
`OPENAI_BASEURL`, and `OPENAI_MODEL` for OpenAI or another OpenAI-compatible provider. The examples
default to the chat-completions API; set `OPENAI_COMPLETION_API=responses` when the provider supports
the OpenAI Responses API.

These examples enable full observer prompt/response capture and reporter `includePayloads` because
they use synthetic data. Evaluation inputs/outputs are included so observed datasets can be saved
and published for the managed-dataset example. Keep the
default safe capture mode for applications that may contain sensitive data.

## Learning path

| Command                      | Lens surface            | What it demonstrates                                    |
| ---------------------------- | ----------------------- | ------------------------------------------------------- |
| `pnpm example:anvia`         | Traces                  | First named agent and live generation                   |
| `pnpm example:anvia:context` | Traces, Sessions, Users | Trace identity, metadata, tags, user, and session       |
| `pnpm example:anvia:tools`   | Traces                  | Agent, generation, and tool observations                |
| `pnpm example:anvia:eval`    | Runs, Results           | Multi-case evaluation with deterministic metrics        |
| `pnpm example:anvia:judge`   | Runs, Results           | Live agent output evaluated by an LLM judge             |
| `pnpm example:anvia:dataset` | Datasets, Runs, Results | Published managed dataset fetched through `@anvia/lens` |
| `pnpm example:anvia:release` | Compare, Gates          | Baseline and candidate runs for a release decision      |

Commands may also be run from this directory with `pnpm basics:01`, `pnpm tools:01`,
`pnpm evaluations:01`, `pnpm evaluations:02`, `pnpm evaluations:03`, and `pnpm release:01`.

Before running the managed dataset example, run `pnpm example:anvia:eval`, open its observed
`support-policy-cases` dataset in Lens, save it as managed, and publish the `v1` draft. Configure a
different published dataset with `ANVIA_LENS_DATASET_NAME` and `ANVIA_LENS_DATASET_VERSION`. Leave
the version empty to fetch the latest published version.

The judge and release examples make multiple provider calls and may incur additional cost. The
release example creates comparable runs; create a gate in the Lens **Gates** page and apply it to the
printed candidate run.

## Offline verification

From the repository root:

```sh
pnpm --filter @lens/example-anvia-agent typecheck
pnpm --filter @lens/example-anvia-agent build
pnpm --filter @lens/example-anvia-agent test
```

Typechecking and building cover all seven examples. The test runs a real SDK Agent with a synthetic
completion model, deterministic passing/failing evaluation cases, and a temporary local OTLP
collector. It asserts exported agent/generation spans, trace-correlated evaluation results, and run
start/completion records. It requires no API keys, provider access, Docker, or running Lens instance;
only loopback HTTP is used. A second test runs all seven actual entrypoints through the OpenAI
adapter against synthetic local HTTP responses, including tool calls, judge output, and managed
dataset retrieval. CI runs both tests explicitly. Live provider quality, managed server data,
and end-to-end Lens persistence still require running the corresponding learning-path commands.
