---
layout: ../../../layouts/DocsLayout.astro
title: Project settings
description: Manage ingestion credentials, telemetry retention, and permanent project deletion.
eyebrow: Management
---

Project settings controls how applications write telemetry and how long the project keeps it.
Management actions require owner or admin access.

## Create an ingestion key

Enter a descriptive name such as `Production API` and select **Create key**. Lens generates:

- An `ANVIA_LENS_PUBLIC_KEY` beginning with `pk-lens-`.
- An `ANVIA_LENS_SECRET_KEY` beginning with `sk-lens-`.

The secret is displayed only in the creation response. Copy both values before closing the panel.
Lens stores a keyed hash of the secret rather than a recoverable copy.

Active-key rows display the public key and last-used date. Revoked keys are hidden from the active
list.

## Rotate a key

1. Create a new named key.
2. Deploy the new public and secret values to every application using the old key.
3. Confirm the new key reports recent use.
4. Revoke the old key.

Revocation takes effect immediately and cannot be undone. Keep separate keys for workloads that
need independent rotation or revocation.

## Set data retention

Choose 7, 30, 90 days, or Unlimited and select **Save retention**. The worker reconciles expiration
asynchronously across traces, spans, evaluation results, and evaluation runs.

Shortening retention can make older telemetry eligible for removal. Extending retention updates
existing retained telemetry when the background job runs, but it cannot restore data that was
already deleted.

Managed datasets and workspace configuration are not ordinary telemetry and are not removed by the
project telemetry retention window.

## Delete a project

The danger zone permanently deletes the project. After confirmation:

1. The project enters a deleting state.
2. Every project ingestion key is revoked immediately.
3. The worker removes ClickHouse telemetry and PostgreSQL project data.
4. The project disappears when deletion finishes.

This action has no restore workflow. Export or back up required data before confirming.
