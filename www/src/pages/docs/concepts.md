---
layout: ../../layouts/DocsLayout.astro
title: Core concepts
description: The small set of objects that make up the Lens observability and evaluation model.
eyebrow: Introduction
---

Lens uses a small set of related objects. Understanding their boundaries makes the observability
and evaluation screens much easier to navigate.

## Example: one support request through Lens

The runnable support examples use the same objects from live traffic through release evaluation:

| Event | Lens object | Example |
| --- | --- | --- |
| A customer asks for a ticket summary | Trace | `support-ticket-summary` |
| The agent calls a model and reads the ticket | Observations | Generation and `get_ticket` tool spans |
| The request belongs to a conversation and customer | Session and user | `example-session-1001`, `example-user-42` |
| The team tests the refund policy | Evaluation case and result | `refund-window`, `policy-fact-present` |
| The same cases run against a new build | Evaluation run | Baseline and candidate releases |
| The team requires every policy check to pass | Quality gate | Metric pass rate of 100% |

Run `pnpm example:anvia:context` to create the trace, session, and user. Run
`pnpm example:anvia:eval` to create the evaluation objects. The sections below define the boundaries
you will see in those examples.

## Workspace and projects

The **workspace** is the Lens installation. It contains members, organization-wide model pricing,
and one or more projects.

A **project** is the isolation boundary for telemetry, evaluations, managed datasets, ingestion
credentials, and retention. Workspace membership applies across projects, while every telemetry
query and credential is project-scoped.

Use separate projects when two applications should not share telemetry, keys, or retention. Use
environments inside one project when the same application needs `development`, `staging`, and
`production` views.

## Traces and observations

A **trace** represents one end-to-end application operation, such as answering a support request.
Its **observations** describe the work inside that operation: agent steps, model generations, tool
calls, embeddings, evaluators, and ordinary nested spans. Lens retains the parent-child structure
and timing exported through OpenTelemetry.

For example, one support trace might contain an agent observation, a retrieval tool call, and two
model generations. The trace reports the total result; each observation explains where time,
tokens, cost, or an error originated.

## Sessions and users

**Sessions** group related traces into a conversation or multi-step workflow. A session can contain
many traces. **User identifiers** connect activity across sessions so you can inspect reliability,
usage, and cost for one application user.

Session and user views depend on identifiers supplied by instrumentation. Lens does not infer them
from prompt content.

## Evaluation runs and results

An **evaluation run** records one execution of a named suite. The suite contains cases; every case
supplies input to a target and can produce one or more metric results. When the target is
instrumented, its result links back to the trace created while that case ran.

Run status and result outcome answer different questions. A run can be `completed` even when some
metric results fail: completion means the suite finished, while a result says whether a particular
quality check passed. Runs can be `running`, `completed`, or `failed`; results can pass, fail, be
invalid, or remain unknown when an evaluator cannot produce a usable outcome.

For example, `support-policy-regression` can complete all three cases while `refund-window` fails
`policy-fact-present`. The suite executed successfully, but that release did not satisfy the tested
behavior.

## Datasets

An **observed dataset** is reconstructed from cases reported by evaluation telemetry. It describes
what a suite actually ran. A **managed dataset** is curated inside Lens and provides immutable,
published versions that evaluation code can request for repeatable runs.

An observed version can be imported only when it is complete, conflict-free, and every case has a
captured payload. Managed drafts are editable; published versions are immutable.

## Releases and environments

**Environment** and **release** are optional telemetry dimensions supplied by your instrumentation.
Environment describes where code ran, such as `staging`; release identifies the exact deployed
build, such as a Git SHA or version. Together they make runs filterable and changes comparable.

Lens does not provide a manual “release” action for an evaluation run. A run is released or
unreleased according to whether its instrumentation supplied release metadata.

## Costs

Generations may report input, cached-input, and output costs directly. Organization-wide model
pricing can calculate or override those amounts for an exact model name. A recalculation applies a
selected price snapshot to existing telemetry in a chosen date range; changing a price alone does
not silently rewrite history.

## Retention

Each project retains telemetry for 7, 30, 90 days, or indefinitely. Retention changes are processed
asynchronously by the worker, so expired data may not disappear at the instant a setting changes.
Managed datasets and workspace configuration are not ordinary telemetry and follow their own
lifecycle.

## Roles

The owner is created during bootstrap and cannot be demoted or removed. Owners and admins manage
members, projects, project keys and retention, managed datasets, and quality gates. Members can
inspect projects and their telemetry.

See [Members and roles](/docs/management/members/) for the complete permissions table.
