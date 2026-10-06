import type { QueryParams } from "@clickhouse/client";

/** Stop read-only server work when an aborted HTTP request closes its connection. */
export function readCancellation(
  signal: AbortSignal | undefined,
): Pick<QueryParams, "abort_signal" | "clickhouse_settings"> {
  return signal === undefined
    ? {}
    : {
        abort_signal: signal,
        clickhouse_settings: { cancel_http_readonly_queries_on_client_close: 1 },
      };
}
