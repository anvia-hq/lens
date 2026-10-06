# Evaluation query benchmark

Measured locally on 2026-10-06 with Node 26.9.0 and ClickHouse 26.4 in Docker
(10 virtual CPUs, 8 GiB RAM). Synthetic runs contain one quality metric per case,
1 KiB payloads, and a 50% candidate regression rate. Each size has a candidate and
baseline run; no traces are inserted, so operational coverage is intentionally zero.
These are single-run measurements with other local development work active, not a
production capacity or tail-latency guarantee.

Standard uses ClickHouse defaults. Constrained uses the query settings from
`docker-compose.small.yml`: 2 threads, 384 MiB query memory, and 192 MiB external
aggregation/sort thresholds. Both use the same container; this compares query
profiles, not different container CPU/RAM limits.

| Results/run | Profile     | Operation  | ClickHouse queries | Peak in-flight queries | Time (ms) | Node peak RSS (MiB) | RSS growth (MiB) | Peak individual ClickHouse query memory (MiB) |
| ----------- | ----------- | ---------- | ------------------ | ---------------------- | --------- | ------------------- | ---------------- | --------------------------------------------- |
| 10,000      | standard    | detail     | 5                  | 2                      | 64        | 91.9                | 1.0              | 57.4                                          |
| 10,000      | standard    | comparison | 9                  | 4                      | 71        | 94.6                | 0.6              | 57.4                                          |
| 10,000      | standard    | gate       | 8                  | 4                      | 35        | 95.7                | 0.8              | 57.4                                          |
| 10,000      | constrained | detail     | 5                  | 2                      | 34        | 99.2                | 2.6              | 7.8                                           |
| 10,000      | constrained | comparison | 9                  | 4                      | 68        | 100.6               | 0.1              | 16.6                                          |
| 10,000      | constrained | gate       | 8                  | 4                      | 31        | 100.9               | 0.2              | 7.5                                           |
| 100,000     | standard    | detail     | 5                  | 2                      | 156       | 103.2               | 0.7              | 57.4                                          |
| 100,000     | standard    | comparison | 9                  | 4                      | 307       | 105.3               | 0.2              | 184.2                                         |
| 100,000     | standard    | gate       | 8                  | 4                      | 78        | 105.4               | 0.0              | 57.4                                          |
| 100,000     | constrained | detail     | 5                  | 2                      | 114       | 105.5               | 0.0              | 12.7                                          |
| 100,000     | constrained | comparison | 9                  | 4                      | 339       | 105.5               | 0.0              | 181.7                                         |
| 100,000     | constrained | gate       | 8                  | 4                      | 72        | 105.6               | 0.0              | 12.7                                          |

The benchmark asserts exact 5,000/50,000 regression counts, 100 returned comparison
rows, explicit truncation, and 100 returned inspection results with full run totals.
Gate checks use aggregates only. The query counts above measure the ClickHouse reader only.
For a run linked to a managed dataset, the API adds one PostgreSQL query scoped to
project, dataset name, and published version, selecting payloads for at most the
100 distinct case IDs on the current result page. Empty pages and pages containing
only unspecified case IDs skip PostgreSQL hydration. This synthetic benchmark does
not measure that additional PostgreSQL query. Query count and concurrency stay constant as result
count grows. Node memory samples include runtime/GC effects; server memory comes
from `system.query_log`, not from the Node process.

Cancellation is triggered 5 ms after dispatching the case-comparison query. All four
size/profile combinations rejected, within 0–6 ms after abort. Signaled reads set
`cancel_http_readonly_queries_on_client_close=1`; this verifies client rejection,
not a separate measurement of server resource reclamation. Browser queries pass
abort signals through the API to ClickHouse.

## Reproduce

Start an isolated ClickHouse service with a unique Compose project name and obtain
its random published port:

```sh
docker compose -f docker-compose.test.yml -p lens-eval-benchmark up -d --wait clickhouse
docker compose -f docker-compose.test.yml -p lens-eval-benchmark port clickhouse 8123
```

Use the reported port (replace `PORT`):

```sh
CLICKHOUSE_URL=http://127.0.0.1:PORT pnpm --filter @lens/db exec tsx scripts/benchmark-evaluations.ts
docker compose -f docker-compose.test.yml -p lens-eval-benchmark down --volumes
```

The script creates a random database, applies ClickHouse migrations, inserts only
synthetic data, and drops that database in `finally`. It never modifies existing
tables. `CLICKHOUSE_USERNAME` and `CLICKHOUSE_PASSWORD` default to the disposable
Compose credentials. The account needs database creation and query-log access.

## Boundaries

Run inspection paginates **results**, not complete cases; a case can span pages.
The UI states that case summaries/search/filters are page-local, while run and
metric summaries cover all results. Payloads are read only on the inspection path.
Comparisons read lean case/metric tuples in ClickHouse and return at most 100 rows;
classification totals cover all rows. Duplicate case/metric keys preserve the old
reader's last-entry rule (oldest timestamp, greatest result ID at equal timestamp).

Observed-dataset snapshot analysis still requires complete case definitions. Its
legacy reader now fetches pages serially and counts only once, but dataset snapshot
memory usage is not bounded by the run-inspection page size.
