import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");

const enabledByDefaultBooleanString = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value !== "false");

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const domainList = z
  .string()
  .optional()
  .transform((value) =>
    value
      ?.split(/[\s,]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );

const caseSensitiveStringList = z
  .string()
  .optional()
  .transform((value) =>
    value
      ?.split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  );

const positiveInteger = (defaultValue: number) =>
  z.coerce.number().int().positive().default(defaultValue);

const nonnegativeInteger = (defaultValue: number) =>
  z.coerce.number().int().nonnegative().default(defaultValue);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
    API_PORT: positiveInteger(3001),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    POSTGRES_URL: z.string().min(1).default("postgresql://lens:lens@localhost:5432/lens"),
    POSTGRES_MAX_CONNECTIONS: positiveInteger(10),
    CLICKHOUSE_URL: z.url().default("http://localhost:8123"),
    CLICKHOUSE_DATABASE: z.string().min(1).default("lens"),
    CLICKHOUSE_USERNAME: z.string().min(1).default("lens"),
    CLICKHOUSE_PASSWORD: z.string().default("lens"),
    CLICKHOUSE_MAX_THREADS: nonnegativeInteger(0),
    CLICKHOUSE_MAX_MEMORY_USAGE_BYTES: nonnegativeInteger(0),
    CLICKHOUSE_MAX_BYTES_BEFORE_EXTERNAL_GROUP_BY: nonnegativeInteger(0),
    CLICKHOUSE_MAX_BYTES_BEFORE_EXTERNAL_SORT: nonnegativeInteger(0),
    REDIS_URL: z.url().default("redis://localhost:6379"),
    SYSTEM_MONITOR_URL: optionalString.pipe(z.url().optional()),
    BETTER_AUTH_SECRET: z.string().min(32).default("development-only-secret-change-me-now"),
    PASSWORD_LOGIN_ENABLED: enabledByDefaultBooleanString,
    OIDC_ENABLED: booleanString,
    OIDC_PROVIDER_ID: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .default("oidc"),
    OIDC_DISPLAY_NAME: z.string().trim().min(1).max(100).default("Company SSO"),
    OIDC_DISCOVERY_URL: optionalString.pipe(z.url().optional()),
    OIDC_CLIENT_ID: optionalString,
    OIDC_CLIENT_SECRET: optionalString,
    OIDC_SCOPES: caseSensitiveStringList.default(["openid", "profile", "email"]),
    OIDC_REQUIRE_ISSUER_VALIDATION: booleanString,
    OIDC_AUTO_PROVISION: booleanString,
    OIDC_ALLOWED_DOMAINS: domainList.default([]),
    INGESTION_KEY_PEPPER: z.string().min(16).default("development-ingestion-key-pepper"),
    SMTP_HOST: optionalString,
    SMTP_PORT: positiveInteger(587),
    SMTP_FROM: z.string().default("Anvia Lens <lens@localhost>"),
    SMTP_SECURE: booleanString,
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    OTLP_MAX_BODY_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(10 * 1024 * 1024),
    OTLP_RATE_LIMIT_PER_MINUTE: positiveInteger(600),
    INGESTION_QUEUE_MAX_WAITING: nonnegativeInteger(0),
    MCP_RATE_LIMIT_PER_MINUTE: positiveInteger(120),
    WORKER_INGEST_CONCURRENCY: positiveInteger(8),
    WORKER_MATERIALIZE_CONCURRENCY: positiveInteger(8),
    WORKER_EVALUATION_CONCURRENCY: positiveInteger(8),
    MATERIALIZE_DELAY_MS: nonnegativeInteger(1_500),
    QUEUE_RETAIN_COMPLETED_AGE_SECONDS: positiveInteger(3_600),
    QUEUE_RETAIN_COMPLETED_COUNT: positiveInteger(10_000),
    QUEUE_RETAIN_FAILED_AGE_SECONDS: positiveInteger(7 * 86_400),
    QUEUE_RETAIN_FAILED_COUNT: positiveInteger(10_000),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  })
  .refine((value) => (value.SMTP_USER === undefined) === (value.SMTP_PASSWORD === undefined), {
    message: "SMTP_USER and SMTP_PASSWORD must be configured together",
    path: ["SMTP_PASSWORD"],
  })
  .refine((value) => value.SMTP_USER === undefined || value.SMTP_HOST !== undefined, {
    message: "SMTP_HOST is required when SMTP authentication is configured",
    path: ["SMTP_HOST"],
  })
  .superRefine((value, context) => {
    if (!value.PASSWORD_LOGIN_ENABLED && !value.OIDC_ENABLED) {
      context.addIssue({
        code: "custom",
        message: "Enable password login or OIDC",
        path: ["PASSWORD_LOGIN_ENABLED"],
      });
    }
    if (!value.OIDC_ENABLED) return;
    for (const field of ["OIDC_DISCOVERY_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET"] as const) {
      if (value[field] === undefined) {
        context.addIssue({
          code: "custom",
          message: `${field} is required when OIDC is enabled`,
          path: [field],
        });
      }
    }
    if (!value.OIDC_SCOPES.includes("openid")) {
      context.addIssue({
        code: "custom",
        message: "OIDC_SCOPES must include openid",
        path: ["OIDC_SCOPES"],
      });
    }
    if (value.OIDC_AUTO_PROVISION && value.OIDC_ALLOWED_DOMAINS.length === 0) {
      context.addIssue({
        code: "custom",
        message: "OIDC_ALLOWED_DOMAINS is required when OIDC auto-provisioning is enabled",
        path: ["OIDC_ALLOWED_DOMAINS"],
      });
    }
  });

export type LensConfig = z.infer<typeof envSchema>;

export function parseConfig(source: NodeJS.ProcessEnv): LensConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid Anvia Lens configuration: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}
