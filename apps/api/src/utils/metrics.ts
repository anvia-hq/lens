import { Counter, Histogram, Registry } from "prom-client";

export function createIngestionMetrics() {
  const registry = new Registry();
  const accepted = new Counter({
    name: "lens_ingest_spans_accepted_total",
    help: "Accepted OTLP spans",
    registers: [registry],
  });
  const rejected = new Counter({
    name: "lens_ingest_spans_rejected_total",
    help: "Rejected OTLP requests or spans",
    labelNames: ["reason"],
    registers: [registry],
  });
  const duration = new Histogram({
    name: "lens_ingest_duration_seconds",
    help: "OTLP request acceptance latency",
    registers: [registry],
  });
  return { registry, accepted, rejected, duration };
}

export type IngestionMetrics = ReturnType<typeof createIngestionMetrics>;
