---
layout: ../../../layouts/DocsLayout.astro
title: Users
description: Aggregate reliability, usage, sessions, tokens, and cost by application user ID.
eyebrow: Observability
---

The Users explorer groups traces by the `userId` supplied by instrumentation. It is useful for
support investigations, adoption analysis, and locating expensive or unreliable usage patterns.

## Example: inspect one user across sessions

Run `pnpm example:anvia:context`, open **Users**, and search for `example-user-42`. Open the user and
select the `support-ticket-summary` trace from its activity.

**Expected result:** the user aggregates the example trace, its `example-session-1001` session,
tokens, cost, and status for the selected time range. Sending another trace with the same `userId`
but a different `sessionId` increases the user totals while creating a separate session.

## Supply a user ID

Use a stable application identifier, not a display name. Lens does not create product end users or
infer identity from payloads. Avoid sending an email address or other personal data when an opaque
internal ID is sufficient.

## Search and sort users

Choose a time range and search by user ID. The table reports first and last activity, trace and
session counts, errors, tokens, and cost. Sort the table to surface the most active, most expensive,
or least reliable users.

## Open a user

The user detail page summarizes traces, sessions, errors, tokens, and cost for the selected range.
Its trace list is scoped to that exact user and can be opened for span-level investigation.

Changing the range recalculates activity metrics without changing the user identity. A user can
exist in the workspace but show no traces in a narrow range.

## Connect users and sessions

A trace can contain both `userId` and `sessionId`. This allows the user detail to aggregate across
sessions while the session detail reconstructs an individual interaction. Use both identifiers when
the application has a meaningful user and conversation model.
