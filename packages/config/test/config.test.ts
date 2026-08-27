import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/index";

describe("loadConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("provides development defaults", () => {
    const config = loadConfig({});
    expect(config.API_PORT).toBe(3001);
    expect(config.PASSWORD_LOGIN_ENABLED).toBe(true);
    expect(config.OIDC_ENABLED).toBe(false);
    expect(config.OIDC_SCOPES).toEqual(["openid", "profile", "email"]);
    expect(config.OTLP_MAX_BODY_BYTES).toBe(10 * 1024 * 1024);
    expect(config.MCP_RATE_LIMIT_PER_MINUTE).toBe(120);
  });

  it("parses an OIDC provider and normalizes list values", () => {
    const config = loadConfig({
      OIDC_ENABLED: "true",
      OIDC_DISCOVERY_URL: "https://id.example.com/.well-known/openid-configuration",
      OIDC_CLIENT_ID: "lens",
      OIDC_CLIENT_SECRET: "secret",
      OIDC_SCOPES: "openid, profile Custom.Read",
      OIDC_AUTO_PROVISION: "true",
      OIDC_ALLOWED_DOMAINS: "Example.COM, subsidiary.example.com",
      OIDC_REQUIRE_ISSUER_VALIDATION: "true",
      PASSWORD_LOGIN_ENABLED: "false",
    });

    expect(config).toMatchObject({
      OIDC_ENABLED: true,
      OIDC_PROVIDER_ID: "oidc",
      OIDC_SCOPES: ["openid", "profile", "Custom.Read"],
      OIDC_ALLOWED_DOMAINS: ["example.com", "subsidiary.example.com"],
      OIDC_AUTO_PROVISION: true,
      OIDC_REQUIRE_ISSUER_VALIDATION: true,
      PASSWORD_LOGIN_ENABLED: false,
    });
  });

  it.each([
    [{ OIDC_ENABLED: "true" }, "OIDC_DISCOVERY_URL"],
    [
      {
        OIDC_ENABLED: "true",
        OIDC_DISCOVERY_URL: "https://id.example.com/.well-known/openid-configuration",
        OIDC_CLIENT_ID: "lens",
        OIDC_CLIENT_SECRET: "secret",
        OIDC_SCOPES: "profile email",
      },
      "OIDC_SCOPES",
    ],
    [
      {
        OIDC_ENABLED: "true",
        OIDC_DISCOVERY_URL: "https://id.example.com/.well-known/openid-configuration",
        OIDC_CLIENT_ID: "lens",
        OIDC_CLIENT_SECRET: "secret",
        OIDC_AUTO_PROVISION: "true",
      },
      "OIDC_ALLOWED_DOMAINS",
    ],
    [{ PASSWORD_LOGIN_ENABLED: "false" }, "PASSWORD_LOGIN_ENABLED"],
  ])("rejects incomplete or unsafe OIDC configuration %s", (source, field) => {
    expect(() => loadConfig(source)).toThrow(
      new RegExp(`Invalid Anvia Lens configuration.*${field}`, "s"),
    );
  });

  it("coerces supported numeric and boolean values", () => {
    const config = loadConfig({
      API_PORT: "4100",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "2465",
      SMTP_SECURE: "true",
      SMTP_USER: "lens",
      SMTP_PASSWORD: "secret",
      OTLP_MAX_BODY_BYTES: "2048",
      MCP_RATE_LIMIT_PER_MINUTE: "90",
    });
    expect(config).toMatchObject({
      API_PORT: 4100,
      SMTP_PORT: 2465,
      SMTP_SECURE: true,
      SMTP_USER: "lens",
      SMTP_PASSWORD: "secret",
      OTLP_MAX_BODY_BYTES: 2048,
      MCP_RATE_LIMIT_PER_MINUTE: 90,
    });
  });

  it.each([
    [{ API_PORT: "0" }, "API_PORT"],
    [{ PUBLIC_APP_URL: "not-a-url" }, "PUBLIC_APP_URL"],
    [{ BETTER_AUTH_SECRET: "short" }, "BETTER_AUTH_SECRET"],
    [{ INGESTION_KEY_PEPPER: "short" }, "INGESTION_KEY_PEPPER"],
    [{ MCP_RATE_LIMIT_PER_MINUTE: "0" }, "MCP_RATE_LIMIT_PER_MINUTE"],
    [{ SMTP_SECURE: "yes" }, "SMTP_SECURE"],
    [{ SMTP_USER: "lens" }, "SMTP_PASSWORD"],
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
