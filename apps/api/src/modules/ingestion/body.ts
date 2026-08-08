import { gunzip } from "node:zlib";

export type IngestionBodyErrorCode =
  | "payload_too_large"
  | "invalid_gzip"
  | "unsupported_content_encoding";

export class IngestionBodyError extends Error {
  constructor(
    readonly code: IngestionBodyErrorCode,
    readonly reason: "body_size" | "decompressed_size" | "gzip" | "content_encoding",
    message: string,
  ) {
    super(message);
  }
}

export async function readIngestionBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const encoding = (request.headers.get("content-encoding") ?? "identity").trim().toLowerCase();
  if (encoding !== "identity" && encoding !== "gzip") {
    throw new IngestionBodyError(
      "unsupported_content_encoding",
      "content_encoding",
      "Use identity or gzip content encoding",
    );
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw tooLarge("body_size", "OTLP request exceeds the configured body limit");
  }
  const compressed = await readBounded(request.body, maxBytes);
  if (encoding === "identity") return compressed;
  return gunzipBounded(compressed, maxBytes);
}

async function readBounded(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array> {
  if (stream === null) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("body limit exceeded").catch(() => undefined);
        throw tooLarge("body_size", "OTLP request exceeds the configured body limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function gunzipBounded(bytes: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  try {
    const output = await new Promise<Buffer>((resolve, reject) => {
      gunzip(bytes, { maxOutputLength: maxBytes }, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
    return new Uint8Array(output);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "ERR_BUFFER_TOO_LARGE"
    ) {
      throw tooLarge("decompressed_size", "Decompressed OTLP request exceeds the body limit");
    }
    throw new IngestionBodyError("invalid_gzip", "gzip", "Unable to decompress request body");
  }
}

function tooLarge(reason: "body_size" | "decompressed_size", message: string): IngestionBodyError {
  return new IngestionBodyError("payload_too_large", reason, message);
}
