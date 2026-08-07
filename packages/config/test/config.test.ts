import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/index";

describe("loadConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("provides development defaults", () => {
    const config = loadConfig({});
    expect(config.API_PORT).toBe(3001);
    expect(config.OTLP_MAX_BODY_BYTES).toBe(10 * 1024 * 1024);
  });

  it("coerces supported numeric and boolean values", () => {
    const config = loadConfig({
      API_PORT: "4100",
      SMTP_PORT: "2465",
      SMTP_SECURE: "true",
      OTLP_MAX_BODY_BYTES: "2048",
    });
    expect(config).toMatchObject({
      API_PORT: 4100,
      SMTP_PORT: 2465,
      SMTP_SECURE: true,
      OTLP_MAX_BODY_BYTES: 2048,
    });
  });

  it.each([
    [{ API_PORT: "0" }, "API_PORT"],
    [{ PUBLIC_APP_URL: "not-a-url" }, "PUBLIC_APP_URL"],
    [{ BETTER_AUTH_SECRET: "short" }, "BETTER_AUTH_SECRET"],
    [{ INGESTION_KEY_PEPPER: "short" }, "INGESTION_KEY_PEPPER"],
    [{ SMTP_SECURE: "yes" }, "SMTP_SECURE"],
    [{ LOG_LEVEL: "verbose" }, "LOG_LEVEL"],
  ])("reports invalid configuration for %s", (source, field) => {
    expect(() => loadConfig(source)).toThrow(
      new RegExp(`Invalid Anvia Lens configuration.*${field}`, "s"),
    );
  });

  it("does not cache explicitly supplied environments", () => {
    expect(loadConfig({ API_PORT: "3002" }).API_PORT).toBe(3002);
    expect(loadConfig({ API_PORT: "3003" }).API_PORT).toBe(3003);
  });

  it("caches the parsed process environment", async () => {
    vi.stubEnv("API_PORT", "4111");
    vi.resetModules();
    const module = await import("../src/index.js");
    const first = module.loadConfig();
    vi.stubEnv("API_PORT", "4222");
    const second = module.loadConfig();
    expect(first.API_PORT).toBe(4111);
    expect(second).toBe(first);
  });
});
