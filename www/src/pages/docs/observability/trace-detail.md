---
layout: ../../../layouts/DocsLayout.astro
title: Trace details
description: Navigate a trace tree, timeline, or execution graph and inspect every observation, payload, attribute, and error.
eyebrow: Observability
---

The trace detail view keeps structure, timing, and data visible together. It is designed for moving
from the failing or expensive part of a run to the exact input, output, and metadata that explains
it.

<figure>
  <img src="/images/docs/trace-detail.png" alt="Anvia Lens trace detail showing a nested agent span tree and the formatted input, output, metadata, duration, token, and service inspector" loading="lazy" decoding="async" />
  <figcaption>A complete agent trace with generation and tool observations.</figcaption>
</figure>

## Example: explain a support-agent result

Run `pnpm example:anvia:tools`, open the printed trace ID, and select `get_ticket` in the span tree.
Check its input for `TICKET-1001`, its output for the synthetic high-severity ticket, and its status
and duration. Then select the following model generation to see how the tool result became the
final triage response.

**Expected result:** the tree shows an agent parent with generation and tool children; selecting a
row highlights the same observation in the timeline or graph and opens its payload in the
inspector. If payload content is absent in another application, confirm that full capture is
allowed and enabled before treating the absence as an instrumentation problem.

## Read the trace header

The header identifies the trace by name and ID and summarizes status, start time, duration, span
count, token usage, and cost. Project context remains in the application header so the trace cannot
be mistaken for data from another project.

## Review production quality

Every project member can record one shared **Pass** or **Fail** review with an optional note. The
latest review replaces the previous review and records its reviewer. It also appears as a
human-sourced evaluation result, so it can be found from the evaluation Results explorer.

For a failed trace, owners and admins can choose **Promote to dataset**, select a managed dataset
with an open draft, review the root input and output JSON, and add it as a draft case. Promotion is
unavailable when the trace has no captured root input. Existing cases with the same case ID are
updated by the managed dataset workflow.

## Navigate the span tree

The left panel preserves the exported parent-child relationship. Observation glyphs distinguish
agents, generations, tools, evaluators, embeddings, retrieval work, and ordinary spans.

- Search spans by name.
- Expand or collapse an individual branch.
- Use the global control to expand or collapse the entire tree.
- Select a row to synchronize the timeline and inspector.

## Use the timeline

The timeline positions each observation relative to the full trace. Long bars reveal long-running
work; nesting shows which parent operation owned that time. Selecting a bar opens the same span in
the inspector.

For a slow trace, select the longest child before optimizing the parent. A long tool span points to
the external operation; a long generation span points to model or prompt behavior.

## Follow the execution graph

The graph draws every captured observation except events as a node and infers execution flow from
parent relationships and timing. Sequential work forms a chain, overlapping work forms parallel
branches, and later work reconnects those branches. Select a node to open the same span in the
inspector.

Drag to pan, use a mouse wheel or pinch gesture to zoom, and use the canvas controls to zoom or fit
the whole execution. Search keeps the graph in place and dims nodes that do not match, preserving
their surrounding execution context. Very large traces may be better inspected with Tree or
Timeline.

## Inspect a span

The inspector shows the selected span status and observation type, then reports duration, tokens,
cost, model, and service where available. Span and parent IDs support correlation with raw
OpenTelemetry data.

Payload sections include input, output, metadata, and error information. Switch between formatted
and raw JSON when message content is easier to read conversationally or exact serialization is
important. Copy raw JSON when reproducing an issue.

Payloads are available only when instrumentation captured them. Safe capture, redaction, or an
evaluation payload policy may intentionally leave them unavailable.

## Move between traces

Return to the explorer without losing its URL-backed filters, or follow links from a session, user,
evaluation result, or comparison. Related evaluations attached to the trace provide the quality
signal alongside runtime behavior.

## Mobile layout

On narrow screens, tree, timeline, graph, and inspector become tabs. The information is unchanged,
but only one panel is visible at a time. Selecting a graph node opens its data tab.
