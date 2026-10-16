import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("trace summary backfill versions", () => {
  it.each([
    "0002_trace_explorer.sql",
    "0004_terminal_trace_status.sql",
    "0009_running_trace_status.sql",
    "0011_anvia_run_status.sql",
  ])("preserves the copied summary's version in %s", (filename) => {
    const sql = readFileSync(
      new URL(`../migrations/clickhouse/${filename}`, import.meta.url),
      "utf8",
    );
    expect(sql).toMatch(/summary\.expires_at,\s+summary\.summary_version\s+FROM trace_summaries/);
  });
});
