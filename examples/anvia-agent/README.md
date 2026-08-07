# Native Anvia Lens examples

This package is a runnable learning path for sending live Anvia agent traces and evaluations to a
local or hosted Anvia Lens instance. Every agent example calls a real OpenAI-compatible model.

## Setup

Start Lens from the repository root:

```sh
docker compose up -d
```

Create a project key pair from the Lens **Connect** page, then configure this example package:

```sh
cp examples/anvia-agent/.env.example examples/anvia-agent/.env
```

Set the `ANVIA_LENS_*` values to the Lens project credentials. Set `OPENAI_API_KEY`,
`OPENAI_BASEURL`, and `OPENAI_MODEL` for OpenAI or another OpenAI-compatible provider. The examples
default to the chat-completions API; set `OPENAI_COMPLETION_API=responses` when the provider supports
the OpenAI Responses API.

These examples enable full prompt and response capture because they use synthetic data. Keep the
default safe capture mode for applications that may contain sensitive data.

## Learning path

| Command | Lens surface | What it demonstrates |
| --- | --- | --- |
| `pnpm example:anvia` | Traces | First named agent and live generation |
| `pnpm example:anvia:context` | Traces, Sessions, Users | Trace identity, metadata, tags, user, and session |
| `pnpm example:anvia:tools` | Traces | Agent, generation, and tool observations |
| `pnpm example:anvia:eval` | Runs, Results | Multi-case evaluation with deterministic metrics |
| `pnpm example:anvia:judge` | Runs, Results | Live agent output evaluated by an LLM judge |
| `pnpm example:anvia:dataset` | Datasets, Runs, Results | Published managed dataset fetched through `@anvia/lens` |
| `pnpm example:anvia:release` | Compare, Gates | Baseline and candidate runs for a release decision |

Commands may also be run from this directory with `pnpm basics:01`, `pnpm tools:01`,
`pnpm evaluations:01`, `pnpm evaluations:02`, `pnpm evaluations:03`, and `pnpm release:01`.

Before running the managed dataset example, run `pnpm example:anvia:eval`, open its observed
`support-policy-cases` dataset in Lens, save it as managed, and publish the `v1` draft. Configure a
different published dataset with `ANVIA_LENS_DATASET_NAME` and `ANVIA_LENS_DATASET_VERSION`. Leave
the version empty to fetch the latest published version.

The judge and release examples make multiple provider calls and may incur additional cost. The
release example creates comparable runs; create a gate in the Lens **Gates** page and apply it to the
printed candidate run.
