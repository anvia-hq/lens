# Release functional checks and recovery rehearsal

Pull request CI loads its freshly built backend/web images and runs the same functional checks and
failure controls before merge. The published-image promotion gate runs `node scripts/verify-release.mjs --negative-controls`.
It uses production Compose service definitions in a disposable project, random localhost ports,
new volumes, and randomly generated credentials. No model provider or external mail service is used.
The fixture bootstraps an owner, creates a project and ingestion key through HTTP, submits OTLP traces
and evaluation logs, and polls authenticated trace summaries, span details, and evaluation results.
Live/ready/web checks also run. An accepted ingestion request alone does not pass.

Failure controls stop the worker while accepting new trace/evaluation jobs, and separately add a
synthetic ClickHouse insert constraint to `trace_summaries`. Both must leave the functional check
failing while dependency readiness succeeds. The latter must appear as failed materialization work
in `/api/v1/system/health`; removing the constraint and retrying those jobs must restore the summary.
This asserts queue failure counts explicitly because readable queue metrics alone do not mean the
queues have no failures.

## Running locally

Use Node 24 and Docker Compose. Existing images can be used; otherwise build the actual Dockerfile
(with its frozen dependency installs), for example:

```sh
docker build --target backend -t lens-release-candidate:local .
docker build --target web -t lens-release-web-candidate:local .
LENS_TEST_VERSION=local \
LENS_TEST_BACKEND_IMAGE=lens-release-candidate \
LENS_TEST_WEB_IMAGE=lens-release-web-candidate \
LENS_TEST_PREVIOUS_VERSION=0.14.0 \
node scripts/verify-release.mjs --negative-controls --recovery
```

The `--recovery` option requires different explicit previous and candidate image tags. Set
`LENS_TEST_PREVIOUS_BACKEND_IMAGE` and `LENS_TEST_PREVIOUS_WEB_IMAGE` for another registry.
`LENS_TEST_PULL_POLICY=always` refreshes registry images; the default `missing` supports local builds.
Never use `latest` as release evidence. Record image digests and the Git revision with results.
The runner ignores repository `.env`, uses a unique `lens-release-test-*` project, and cleans its own
containers, volumes, and temporary backup directory on completion, failure, SIGINT, or SIGTERM.
An uncatchable process/host failure can leave its named projects behind; inspect their labels before
removing only that run's project. No production Compose project or host data directory is mounted.

## Cadence and recovery acceptance

Run fresh-image checks on every published candidate before tag promotion. Before v1.0, before every
schema/queue compatibility change, and at least once per stable release, run the manually invoked
**Release upgrade and recovery rehearsal** workflow with the previous supported release and candidate
image tags. Do not promote a release with failed preservation checks. The manual rehearsal does not
publish, deploy, promote tags, or change an existing installation.

The rehearsal:

1. Starts the previous image in fresh volumes; creates real authenticated access plus historical
   trace/evaluation data and verifies it through the API.
2. Stops the worker, accepts another trace/evaluation pair, and asserts both queues have waiting work.
3. Stops API and all remaining services, including database engines, and archives PostgreSQL,
   ClickHouse, and Redis volumes at that single quiesced point. Retains matching runtime secrets in
   memory for the rehearsal. A real recovery set must securely retain configuration and image digests,
   including the authentication secret and ingestion-key pepper, alongside its coordinated backups.
4. Starts the candidate against the old volumes and runs migrations. Signs in with the original
   account, checks project membership, reads historical and formerly queued data, and submits fresh
   data with the original key.
5. Removes that installation and creates another project with empty volumes. Restores all three
   archives before starting the candidate, reruns migrations, then repeats the access, historical,
   queued-work, and key assertions. This is a restore into new volumes, not a service restart.

The runner reports upgrade and restore elapsed milliseconds, measured from candidate startup or
empty-volume creation through successful authenticated reads and fresh ingestion. These are observed
synthetic recovery times, not an RTO promise. Cold-volume backups require the same database major
versions and compatible architecture; they do not replace production logical-backup/PITR procedures,
large-data benchmarks, remote-backup integrity checks, or external OIDC-provider recovery drills.
API ingress must remain closed and workers stopped until every member of a real recovery set is
restored. Do not combine a new PostgreSQL snapshot with old ClickHouse or Redis data.

## Failed jobs and manual replay

After recovery, inspect System Health's per-queue waiting, active, delayed, and failed counts and worker
heartbeats. A healthy `/health/ready` or queue-metrics status is insufficient. Failed jobs are retained
according to configured age/count limits; once expired, the original durable telemetry source must
resubmit its payload. Preserve failure evidence and identify the cause before retrying.

The test deliberately exercises the production BullMQ retry operation on known failed materialization
jobs after repairing their insert dependency. For a real incident, identify individual queue/job IDs,
inspect their error and payload privately, verify the owning project still exists and that replay is
appropriate, repair the cause, then call `job.retry()` only for those retained failed jobs through the
installed `@lens/queue` client's `createQueues(REDIS_URL)` connection. Close that connection afterwards.
Do not bulk-retry all queues, recreate deleted projects, or replay jobs against an unrelated recovery
set. Confirm the expected trace/evaluation is readable and failure counts clear. Jobs with external
side effects (for example notification dispatch) require separate duplicate-delivery assessment.

## Observed local rehearsal

On 2026-10-06, the full command above passed against the combined implementation at source
revision `1226ec4`, using published 0.14.0 images and freshly built candidate images with frozen
installs on the local ARM64 Docker host. Upgrade took **13.564 seconds** and coordinated restore
into empty volumes took **14.519 seconds**. Fresh ingestion, stopped-worker and failed-materialization
controls, failed-job visibility and replay, historical and queued trace/evaluation preservation,
original account/project access, and fresh ingestion with the original key all passed. Temporary
containers, volumes, networks, and backup files were removed on completion.

These measurements use a tiny synthetic fixture. They establish behavior for this implementation,
not final published v1.0 image verification or a production RTO. The earlier Wave 1 rehearsal at
`b03a7f7` also passed twice; its second run measured 13.544 seconds for upgrade and 17.237 seconds
for restore. Repeat the rehearsal for the actual release candidate before promotion.

Image manifest digests for the combined-implementation run:

| Image                   | SHA-256 digest                                                     |
| ----------------------- | ------------------------------------------------------------------ |
| Previous backend 0.14.0 | `9504afd2237de784d19dc704100e4842465471836fd58c1f461d79f6dba24d69` |
| Previous web 0.14.0     | `02965655160c8e94938f9cdba7e17aec1da7978c1b8722c09cc36a6423831c27` |
| Candidate backend       | `73423a022898fc83d2374ea880b1f8e77405768f3ef6109ca94522f32d758aec` |
| Candidate web           | `8bc13967b521c120ca30ede055c134098d2f4c78a1bbd4504b22cefc45d82c14` |
