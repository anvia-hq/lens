import { langfuse } from "@anvia/langfuse";

const baseUrl = process.env.LANGFUSE_BASE_URL ?? "http://localhost:3000";
const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
const secretKey = process.env.LANGFUSE_SECRET_KEY;

if (publicKey === undefined || secretKey === undefined) {
  throw new Error("Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY to a Lens key pair");
}

// Lens currently stores trace payloads but not Langfuse media objects.
process.env.LANGFUSE_MEDIA_UPLOAD_ENABLED ??= "false";

// Pass this observer to an Anvia agent with `.observe(tracing)`.
export const tracing = langfuse.create({
  baseUrl,
  publicKey,
  secretKey,
  serviceName: "lens-anvia-example",
});

console.log(`Anvia Langfuse tracing is configured for ${baseUrl}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void Promise.resolve(tracing.shutdown()).then(() => process.exit(0));
  });
}
