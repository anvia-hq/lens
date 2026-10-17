# AGENTS.md

Guidance for Pullfrog and other coding agents working in this repository.

## Project Shape

Lens is a TypeScript pnpm workspace for self-hosted AI agent observability and
evaluation: an API, background worker, host monitor, web application, shared
packages, and native Anvia examples. PostgreSQL stores application data,
ClickHouse stores telemetry, and Redis backs BullMQ jobs.

Workspace packages are declared in `pnpm-workspace.yaml`:

- `apps/*`
- `packages/*`
- `examples/*`

Use `pnpm` from the repository root. The repo declares `pnpm@11.0.4` and
Node.js `>=24`; CI and Docker builds use Node 24.

## Before Editing

- Check the working tree and current branch before making changes.
- Read `CONTRIBUTING.md` and the app, package, or example files you are about to
  change; follow local patterns. Open an issue before a large change.
- Do not edit build output, coverage output, or installed dependencies by hand.
- Keep changes scoped. Avoid mixing dependency updates, generated artifact churn,
  formatting-only changes, and feature work unless required for the same change.
- Never commit secrets, credentials, local environment files, production data,
  or private trace payloads.

## Common Commands

Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm check:fix
pnpm typecheck
pnpm test
pnpm build
```

Prefer package-scoped commands while iterating:

```sh
pnpm --filter @lens/api typecheck
pnpm --filter @lens/api test
pnpm --filter @lens/worker test
pnpm --filter @lens/db test
pnpm --filter @lens/web typecheck
pnpm --filter @lens/web test
pnpm --filter @lens/web build
```

CI's required quality checks are:

```sh
pnpm check
pnpm typecheck
pnpm build
pnpm check:bundle
pnpm test:coverage
pnpm audit:prod
```

For local development, copy `.env.dev.example` to `.env`, then:

```sh
docker compose -f docker-compose.dev.yml up -d postgres redis clickhouse mailpit
pnpm db:migrate
pnpm dev
```

The development command starts API, worker, and web. Production
`docker-compose.yml` uses published images; `docker-compose.dev.yml` builds from
source. The `Dockerfile` has backend and web targets; migrations complete before
API and worker start. `docker-compose.small.yml` supplies resource limits.

## Formatting And Style

- TypeScript is strict, ESM, target `ES2024`, with `moduleResolution: "Bundler"`
  and unchecked indexed access enabled. Shared packages extend the stricter
  `tsconfig.package.json`.
- Oxlint owns linting and Oxfmt owns formatting. Use the root check scripts;
  there is no separate format script.
- `.oxfmtrc.json` uses formatter defaults and ignores `**/routeTree.gen.ts`.
  Markdown is formatted too.
- Match local imports: backend packages commonly use `.js` specifiers; web code
  commonly uses extensionless imports. Keep type-only imports explicit.
- Keep shared contracts typed and validated with Zod. Preserve validation at
  configuration, HTTP, telemetry, and queue boundaries.

## Package Boundaries

Source lives in `src/`; backend tests usually live in `test/`, while web and UI
tests are colocated. Buildable workspaces emit `dist/`.

Follow `packages/README.md`: applications consume package export maps, never
package implementation files. `config` and `contracts` have no application or
infrastructure dependencies. Telemetry normalization has no persistence; queue
construction and routing belong in `queue`; database access belongs in `db`.

Most shared backend packages expose built JavaScript and declarations.
`@lens/db` also exports `./schema`; `@lens/ui` exports source components, hooks,
utilities, and CSS without a build script. When changing a public entrypoint:

1. Update the source and relevant re-exports.
2. Update the package build entries and export map when needed.
3. Keep TypeScript path mappings consistent with those exports.
4. Add or update tests and affected documentation.

Database changes need special care:

- PostgreSQL uses Drizzle migrations in `packages/db/migrations/postgres`.
  Use `pnpm db:generate` for schema changes and review SQL plus migration metadata.
- ClickHouse migrations in `packages/db/migrations/clickhouse` are append-only
  numbered SQL files. Add the next numbered file; never edit applied migrations
  in either database.
- `packages/db/src/migration-runner.ts` sorts ClickHouse filenames and records
  only the filename in `schema_migrations`, without a content checksum. Editing
  an applied file will not rerun it; renaming it can replay its statements.
- Check schema and queued-job compatibility against the previous supported
  release using the release rehearsal described below.

## Package Map

- `apps/api`: Hono HTTP API, authentication, ingestion, MCP, observability,
  evaluations, datasets, prompts, alerts, and quality gates.
- `apps/worker`: BullMQ processors, telemetry materialization, evaluation jobs,
  outbox dispatch, and alert delivery.
- `apps/monitor`: host resource snapshots for system health.
- `apps/web`: React, Vite, TanStack Router/Query, and Tailwind application.
- `packages/config`: validated runtime configuration.
- `packages/contracts`: shared Zod schemas, API types, and job contracts.
- `packages/db`: PostgreSQL/Drizzle and ClickHouse clients, stores, queries,
  migrations, and seed data.
- `packages/queue`: BullMQ queues, job routing, and Redis connections.
- `packages/telemetry`: OTLP decoding, normalization, and transport helpers.
- `packages/notifications`: alert delivery helpers.
- `packages/ui`: shared React components, hooks, styles, and utilities.
- `examples/anvia-agent`: native Anvia tracing, tools, evaluations, datasets,
  and quality-gate examples, with offline compatibility tests.

## Testing Notes

- Unit tests use Vitest; React tests use `happy-dom`. The Anvia example uses
  Node's test runner through tsx.
- `pnpm test` runs fast, hermetic tests. Keep provider calls and credentials out
  of ordinary tests; live examples are separate from offline verification.
- `pnpm test:integration` provisions disposable PostgreSQL, ClickHouse, and Redis
  services through `docker-compose.test.yml`. The runner enables `LENS_INTEGRATION=1`
  for API, worker, db, and queue integration suites, which are otherwise excluded.
- `pnpm test:coverage` is the required CI test path, including coverage thresholds
  and integration tests. Unit-only or integration-only runs do not replace it.
- API unit and OIDC integration tests contribute to one coverage report and run
  after database tests because their fixtures truncate shared tables. Never point
  integration tests at a shared or development database.
- CI also runs `pnpm --filter @lens/example-anvia-agent test`, validates Compose,
  and exercises freshly built images with stopped-worker and failed-materialization
  controls. Read `docs/release-verification.md` when changing ingestion or recovery.

## Scripts

Root scripts in `scripts/` provide verification:

- `scripts/verify-packages.mjs`: runs lint/format checks, typechecking, build,
  coverage, bundle budgets, and dependency audit through `pnpm verify:packages`.
- `scripts/run-package-integration-tests.mjs`: starts isolated services with
  dynamic ports, runs migrations and tests, and removes its containers and volumes
  on completion, failure, or interruption.
- `scripts/check-web-bundle.mjs`: checks the built web manifest and JavaScript
  size budgets through `pnpm check:bundle`; build first.
- `scripts/audit-osv-fallback.mjs`: CI fallback for npm advisory endpoint outages;
  genuine audit findings still fail the gate.
- `scripts/verify-release.mjs`: functional image checks and optional upgrade/restore
  rehearsal. Use the pinned-image setup in `docs/release-verification.md`.
- `scripts/verify-release.test.mjs`: runner cancellation checks, executed in CI
  with `node --test scripts/verify-release.test.mjs`.

Do not run releases, publish images, create release tags, deploy, or push to
`main` unless explicitly requested.

## Generated Files

Generated files include, but are not limited to:

- `dist/` and `coverage/` in workspaces.
- `apps/web/src/routeTree.gen.ts`, generated by TanStack Router.
- PostgreSQL migration SQL and metadata in `packages/db/migrations/postgres`.

Do not commit build or coverage output. Commit intentional new migrations and
their metadata; do not rewrite applied migrations. If a generator rewrites files
unexpectedly, inspect the diff before continuing.

## Dependencies

- Keep dependency changes scoped to the owning workspace and update
  `pnpm-lock.yaml` consistently; CI and image builds use frozen installs.
- Use `workspace:*` for internal dependencies, matching existing manifests.
- Preserve the shared Zod `catalog:` in `pnpm-workspace.yaml` where used; check
  compatibility across contracts, configuration, and their consumers.
- Review workspace overrides and allowed dependency builds before changing them.
- After dependency changes, run relevant package checks and the full gate:

```sh
pnpm verify:packages
```

## Changesets And Releases

Lens does not use Changesets. Workspaces are private; the root `package.json`
version identifies the container release. Follow README's "Maintainer releases"
and `.github/workflows/release.yml`.

For schema or queue compatibility changes, follow `docs/release-verification.md`
and the manual **Release upgrade and recovery rehearsal** workflow in
`.github/workflows/release-rehearsal.yml`. It checks historical data, queued work,
access, ingestion keys, upgrades, and coordinated restoration of all three stores.
Run it before v1.0, before each schema/queue compatibility change, and at least
once per stable release. Use pinned previous/candidate images, record digests and
revision, and do not promote with failed preservation checks.

### Release Flow

1. Update the root `package.json` version on `main` and wait for CI on that commit
   to pass.
2. Open **Actions → Create release → Run workflow**, select `main`, and enter the
   version without `v`. Validation checks version agreement, an unused tag, and green CI.
3. The reusable `.github/workflows/publish-images.yml` publishes versioned AMD64
   and ARM64 backend/web images, runs functional smoke tests and failure controls,
   then promotes verified images to `major.minor` and `latest`.
4. The release workflow creates the Git tag and GitHub Release. The image workflow
   is also available manually or on version tags for recovery; it does not create
   a GitHub Release itself.

## Pull Request Expectations

Before handing work back, report:

- What changed and why.
- Which validation commands ran.
- Any validation that was skipped and why.
- Any migrations, configuration changes, or generated files intentionally changed.

Keep each PR focused, add the smallest regression test appropriate to the change,
and update documentation for behavior, configuration, or deployment changes.
For visible web UI changes, include screenshots or note that no visual verification
was run.
