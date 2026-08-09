---
layout: ../../../layouts/DocsLayout.astro
title: Alerts
description: Create in-app alert rules for runtime health and quality failures.
eyebrow: Observability
---

Alerts turn runtime regressions and failed quality checks into incidents inside each Lens project.
Open **Alerts** from the project sidebar. Every project member can view, acknowledge, and resolve
incidents; project owners and admins can create, edit, disable, and delete rules.

## Runtime rules

Runtime rules can watch trace error rate, trace P95 latency, or tool error rate over a 5, 15, or 60
minute window. Set a threshold and minimum sample count, then optionally scope the rule to an exact
environment, service, or tool name.

Lens evaluates enabled runtime rules once per minute. A rule opens an incident after two
consecutive breached evaluations. Missing samples do not alert. When the signal becomes healthy,
Lens resolves the incident automatically and applies a 30-minute cooldown before reopening it.

## Quality rules

**Failed human review** opens an incident whenever a matching trace receives a failed review. A
later passing review resolves it. **Failed quality gate** watches one selected gate and opens an
incident when a comparison returns either `fail` or `insufficient_data`; a passing comparison
resolves it.

## Work with incidents

Use the **Incidents** tab to filter active or resolved incidents and narrow them by trigger type.
Runtime incidents link to up to five evidence traces. Quality-gate incidents link back to the run
comparison that produced the result.

Select an incident to open its investigation page. Runtime incidents show up to 24 hours of the
exact scoped signal around the breach, including the configured threshold. The page also preserves
the rule condition and scope, records the triggered, acknowledged, and resolved lifecycle, and
shows when an evidence trace has expired under the project's retention policy.

Project owners and admins can select retained evidence traces and promote up to five of them into
an existing managed dataset draft. Review each generated case before importing it. Lens derives the
root input but leaves expected output blank; the observed failed output is shown only as a reference
and is never assumed to be correct.

Acknowledging an incident records that someone is investigating it without hiding it from the
active count. Resolve it manually when the issue is handled, or let runtime and quality recovery
resolve it automatically. Incident history remains available after a rule is deleted and is removed
only when the project is deleted.
