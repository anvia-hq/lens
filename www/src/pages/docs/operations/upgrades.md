---
layout: ../../../layouts/DocsLayout.astro
title: Upgrades and backups
description: Back up persistent data, upgrade pinned images, and verify migrations safely.
eyebrow: Operations
---

Treat an upgrade as a coordinated change to application images and persistent database state.

## Before upgrading

1. Read the release notes for the target version.
2. Record the currently deployed `LENS_VERSION`.
3. Back up `lens-postgres`, `lens-clickhouse`, and `lens-redis`.
4. Confirm the current stack is healthy with `docker compose ps`.
5. Avoid starting unrelated retention, deletion, or cost-recalculation work during the window.

Test backup restoration periodically. A backup that has never been restored is not a verified
recovery path.

## Upgrade the images

Set `LENS_VERSION` in `.env` to the target release, then run:

```sh
docker compose pull
docker compose up -d
docker compose ps
```

The one-shot migration service runs after PostgreSQL and ClickHouse become healthy. The API starts
only after migrations finish successfully, and the web service waits for API readiness.

## Verify the upgrade

Check service state and migration, API, and worker logs:

```sh
docker compose logs migrate
docker compose logs api worker
```

Then sign in and verify a representative project overview, trace detail, evaluation run, managed
dataset, and ingestion request.

## Handle a failed migration

Do not repeatedly restart the full stack without reading the migration error. Keep the API stopped,
preserve logs, and restore the pre-upgrade volumes if the release cannot be safely corrected.

Changing the image tag back is not a complete rollback when a migration already changed persistent
data. Restore the matching backup unless the release notes explicitly document backward-compatible
rollback.

## Preserve volumes

`docker compose down` keeps data. `docker compose down -v` permanently deletes the named volumes and
must never be part of a normal upgrade or restart procedure.
