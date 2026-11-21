import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim().length === 0 ? undefined : value;

const booleanString = z.preprocess(
  emptyToUndefined,
  z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
);

const enabledByDefaultBooleanString = z.preprocess(
  emptyToUndefined,
  z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value !== "false"),
);

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const urlWithProtocols = (protocols: readonly string[], label: string) =>
  z.url().refine(
    (value) => {
      try {
        return protocols.includes(new URL(value).protocol);
      } catch {
        return false;
      }
    },
    { message: `${label} must use ${protocols.join(" or ")}` },
  );

const httpUrl = (label: string) => urlWithProtocols(["http:", "https:"], label);
const redisUrl = urlWithProtocols(["redis:", "rediss:"], "REDIS_URL");
const postgresUrl = urlWithProtocols(["postgres:", "postgresql:"], "POSTGRES_URL");

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
  z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(defaultValue));

const portNumber = (defaultValue: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65_535).default(defaultValue));

const nonnegativeInteger = (defaultValue: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().nonnegative().default(defaultValue));

const DEVELOPMENT_BETTER_AUTH_SECRET = "development-only-secret-change-me-now";
const DEVELOPMENT_INGESTION_KEY_PEPPER = "development-ingestion-key-pepper";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PUBLIC_APP_URL: httpUrl("PUBLIC_APP_URL").default("http://localhost:3000"),
    API_PORT: portNumber(3001),
    WEB_ORIGIN: httpUrl("WEB_ORIGIN").default("http://localhost:3000"),
    POSTGRES_URL: postgresUrl.default("postgresql://lens:lens@localhost:5432/lens"),
    POSTGRES_MAX_CONNECTIONS: positiveInteger(10),
    CLICKHOUSE_URL: httpUrl("CLICKHOUSE_URL").default("http://localhost:8123"),
    CLICKHOUSE_DATABASE: z.string().min(1).default("lens"),
    CLICKHOUSE_USERNAME: z.string().min(1).default("lens"),
    CLICKHOUSE_PASSWORD: z.string().default("lens"),
    CLICKHOUSE_MAX_THREADS: nonnegativeInteger(0),
    CLICKHOUSE_MAX_MEMORY_USAGE_BYTES: nonnegativeInteger(0),
    CLICKHOUSE_MAX_BYTES_BEFORE_EXTERNAL_GROUP_BY: nonnegativeInteger(0),
    CLICKHOUSE_MAX_BYTES_BEFORE_EXTERNAL_SORT: nonnegativeInteger(0),
    REDIS_URL: redisUrl.default("redis://localhost:6379"),
    SYSTEM_MONITOR_URL: optionalString.pipe(httpUrl("SYSTEM_MONITOR_URL").optional()),
    BETTER_AUTH_SECRET: z.string().trim().min(32).default(DEVELOPMENT_BETTER_AUTH_SECRET),
    PASSWORD_LOGIN_ENABLED: enabledByDefaultBooleanString,
    OIDC_ENABLED: booleanString,
    OIDC_PROVIDER_ID: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .default("oidc"),
    OIDC_DISPLAY_NAME: z.string().trim().min(1).max(100).default("Company SSO"),
    OIDC_DISCOVERY_URL: optionalString.pipe(httpUrl("OIDC_DISCOVERY_URL").optional()),
    OIDC_CLIENT_ID: optionalString,
    OIDC_CLIENT_SECRET: optionalString,
    OIDC_SCOPES: caseSensitiveStringList.default(["openid", "profile", "email"]),
    OIDC_REQUIRE_ISSUER_VALIDATION: booleanString,
    OIDC_TOKEN_ENDPOINT_AUTH: z.enum(["auto", "basic", "post"]).default("auto"),
    OIDC_REQUIRE_VERIFIED_EMAIL: booleanString,
    OIDC_AUTO_PROVISION: booleanString,
    OIDC_ALLOWED_DOMAINS: domainList.default([]),
    INGESTION_KEY_PEPPER: z.string().trim().min(16).default(DEVELOPMENT_INGESTION_KEY_PEPPER),
    // AES-256-GCM key for alert channel secrets at rest. Base64/hex 32-byte key,
    // optionally prefixed with a key id ("kid:...") and comma-separated for rotation.
    // Required in production; dev/test fall back to a local-only key.
    LENS_ALERT_SECRET_KEY: optionalString,
    SMTP_HOST: optionalString,
    SMTP_PORT: portNumber(587),
    SMTP_FROM: z.string().default("Anvia Lens <lens@localhost>"),
    SMTP_SECURE: booleanString,
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    OTLP_MAX_BODY_BYTES: positiveInteger(10 * 1024 * 1024),
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
    if (value.NODE_ENV === "production") {
      if (value.BETTER_AUTH_SECRET === DEVELOPMENT_BETTER_AUTH_SECRET) {
        context.addIssue({
          code: "custom",
          message: "BETTER_AUTH_SECRET must not use the development default value in production",
          path: ["BETTER_AUTH_SECRET"],
        });
      }
      if (value.INGESTION_KEY_PEPPER === DEVELOPMENT_INGESTION_KEY_PEPPER) {
        context.addIssue({
          code: "custom",
          message: "INGESTION_KEY_PEPPER must not use the development default value in production",
          path: ["INGESTION_KEY_PEPPER"],
        });
      }
      if (value.LENS_ALERT_SECRET_KEY === undefined) {
        context.addIssue({
          code: "custom",
          message: "LENS_ALERT_SECRET_KEY is required in production",
          path: ["LENS_ALERT_SECRET_KEY"],
        });
      }
    }
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
