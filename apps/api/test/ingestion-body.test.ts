import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { type IngestionBodyError, readIngestionBody } from "../src/modules/ingestion/body.js";

describe("bounded ingestion bodies", () => {
  it("reads identity and gzip bodies within the configured limit", async () => {
    const value = new TextEncoder().encode("telemetry");
    expect(await readIngestionBody(request(value), 32)).toEqual(value);
    expect(
      await readIngestionBody(request(gzipSync(value), { "Content-Encoding": "gzip" }), 32),
    ).toEqual(value);
  });

  it("rejects content-length and streamed bodies above the wire limit", async () => {
    await expect(
      readIngestionBody(request(new Uint8Array(), { "Content-Length": "33" }), 32),
    ).rejects.toMatchObject({ code: "payload_too_large", reason: "body_size" });

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(20));
        controller.enqueue(new Uint8Array(20));
        controller.close();
      },
    });
    await expect(readIngestionBody(streamRequest(body), 32)).rejects.toMatchObject({
      code: "payload_too_large",
      reason: "body_size",
    });
  });

  it("bounds decompressed gzip output", async () => {
    await expect(
      readIngestionBody(request(gzipSync(new Uint8Array(128)), { "Content-Encoding": "gzip" }), 32),
    ).rejects.toMatchObject({ code: "payload_too_large", reason: "decompressed_size" });
  });

  it("distinguishes invalid gzip and unsupported encodings", async () => {
    await expect(
      readIngestionBody(
        request(new TextEncoder().encode("not gzip"), { "Content-Encoding": "gzip" }),
        32,
      ),
    ).rejects.toMatchObject({ code: "invalid_gzip", reason: "gzip" });
    await expect(
      readIngestionBody(request(new Uint8Array(), { "Content-Encoding": "br" }), 32),
    ).rejects.toEqual(
      expect.objectContaining<Partial<IngestionBodyError>>({
        code: "unsupported_content_encoding",
        reason: "content_encoding",
      }),
    );
  });
});

function request(body: BodyInit, headers: Record<string, string> = {}): Request {
  return new Request("http://lens.test/otel", { method: "POST", headers, body });
}

function streamRequest(body: ReadableStream<Uint8Array>): Request {
  return new Request("http://lens.test/otel", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}
