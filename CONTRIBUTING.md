# Contributing to Anvia Lens

Thank you for helping improve Anvia Lens. Contributions of code, tests, documentation, bug reports,
and focused feature proposals are welcome.

By participating, you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- Search existing issues before opening a new one.
- Open an issue before a large change so its scope and approach can be agreed on first.
- Never include credentials, production data, or private trace payloads in an issue or pull request.
- Report security vulnerabilities privately to [hello@anvia.dev](mailto:hello@anvia.dev).

## Development setup

You need Node.js 24, pnpm 11.0.4, and Docker with Compose support.

```sh
pnpm install --frozen-lockfile
cp .env.dev.example .env
docker compose -f docker-compose.dev.yml up -d postgres redis clickhouse mailpit
pnpm db:migrate
pnpm dev
```

Lens opens at <http://localhost>. See the [README](README.md#local-development) for seed data and
other development workflows.

## Make a change

- Keep each pull request focused on one problem.
- Follow the existing code and module patterns before introducing a new abstraction or dependency.
- Add the smallest test that would fail without the change.
- Update the README or in-app documentation when behavior, configuration, or deployment changes.
- Do not commit generated build output, local environment files, or secrets.

## Validate it

Run the same quality checks used by CI before opening a pull request:

```sh
pnpm check
pnpm typecheck
pnpm build
pnpm check:bundle
pnpm test:coverage
pnpm audit:prod
```

Coverage-gated integration tests use Docker for PostgreSQL, ClickHouse, and Redis.

## Open a pull request

Describe what changed, why it changed, and how you verified it. Include screenshots for visible UI
changes and call out migrations or configuration changes explicitly. Keep commits descriptive;
prefixes such as `feat:`, `fix:`, `docs:`, and `test:` are welcome but not required.

## License

By submitting a contribution, you agree that it may be distributed under the repository's
[GNU Affero General Public License Version 3](LICENSE) (`AGPL-3.0-only`). Only submit work that you
have the right to license.
