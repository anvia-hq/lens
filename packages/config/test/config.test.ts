import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/index";

describe("loadConfig", () => {
  it("provides development defaults", () => {
    const config = loadConfig({});
    expect(config.API_PORT).toBe(3001);
    expect(config.OTLP_MAX_BODY_BYTES).toBe(10 * 1024 * 1024);
  });
});
