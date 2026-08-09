---
layout: ../../../layouts/DocsLayout.astro
title: Projects
description: Create isolated destinations for telemetry, evaluations, credentials, and retention.
eyebrow: Management
---

Projects separate application telemetry and evaluation workflows inside one Lens organization.
Every trace, run, result, dataset, gate, ingestion key, and retention query is resolved in project
context.

## Create the first project

Immediately after owner bootstrap, Lens asks for the first project name. Its slug is generated from
the name automatically. After creation, Lens opens the project overview.

## Create another project

Return to the workspace through the project rail, open **Projects**, and select **Create project**.
Owners and admins provide a name and unique slug. Members can open existing projects but cannot
create them.

Use separate projects when telemetry or operational settings must be isolated. Common boundaries
include different products, teams, tenants, or security classifications. Environment alone is
usually better represented by the telemetry `environment` field when the same team needs one
cross-environment view.

## Switch projects

The narrow project rail remains visible on project routes. The top sparkle returns to the workspace,
and each project avatar opens that project's overview. The active project determines all sidebar
queries and management actions.

## Connect applications

Every project needs its own ingestion key pair. Open **Connect** for environment and SDK snippets,
or create credentials from [Project settings](/docs/management/project-settings/).

Do not reuse a project secret across unrelated applications when separate revocation or auditability
is required. Multiple named keys can send to one project.

## Delete a project

Deletion lives in Project settings and requires owner or admin access. Ingestion keys are revoked
immediately, the project enters a deleting state, and the worker removes project telemetry and
configuration asynchronously. This action is permanent.
