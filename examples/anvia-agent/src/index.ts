import { otel } from "@anvia/otel";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

const endpoint = process.env.LENS_OTLP_ENDPOINT ?? "http://localhost:3000/v1/traces";
const ingestionKey = process.env.LENS_INGESTION_KEY;

if (ingestionKey === undefined) {
  throw new Error("Set LENS_INGESTION_KEY to a project ingestion key from Lens");
}

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: endpoint,
    headers: { Authorization: `Bearer ${ingestionKey}` },
  }),
});

sdk.start();

// Pass this observer to an Anvia agent with `.observe(tracing)`.
export const tracing = otel.create({ serviceName: "lens-anvia-example" });

console.log(`Anvia tracing is configured for ${endpoint}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void sdk.shutdown().then(() => process.exit(0));
  });
}
