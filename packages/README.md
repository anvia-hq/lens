# Package boundaries

The backend package dependency direction is intentionally one-way:

```text
config ───────────────▶ db
contracts ─▶ telemetry, queue, db
```

`config` and `contracts` contain no application or infrastructure dependencies. `telemetry`
normalizes OTLP payloads without persistence, `queue` owns BullMQ construction and job routing,
and `db` owns PostgreSQL and ClickHouse access. Applications consume only package export maps; they
must not import package implementation files.

`pnpm test` runs fast, hermetic tests. `pnpm test:integration` provisions isolated temporary
PostgreSQL, ClickHouse, and Redis containers. `pnpm verify:packages` runs the full package and
workspace compatibility gate.
