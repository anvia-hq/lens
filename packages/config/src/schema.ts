import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
    API_PORT: z.coerce.number().int().positive().default(3001),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    POSTGRES_URL: z.string().min(1).default("postgresql://lens:lens@localhost:5432/lens"),
    CLICKHOUSE_URL: z.url().default("http://localhost:8123"),
    CLICKHOUSE_DATABASE: z.string().min(1).default("lens"),
    CLICKHOUSE_USERNAME: z.string().min(1).default("lens"),
    CLICKHOUSE_PASSWORD: z.string().default("lens"),
    REDIS_URL: z.url().default("redis://localhost:6379"),
    SYSTEM_MONITOR_URL: optionalString.pipe(z.url().optional()),
    BETTER_AUTH_SECRET: z.string().min(32).default("development-only-secret-change-me-now"),
    INGESTION_KEY_PEPPER: z.string().min(16).default("development-ingestion-key-pepper"),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_FROM: z.string().default("Anvia Lens <lens@localhost>"),
    SMTP_SECURE: booleanString,
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    OTLP_MAX_BODY_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(10 * 1024 * 1024),
    OTLP_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(600),
    MCP_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  })
  .refine((value) => (value.SMTP_USER === undefined) === (value.SMTP_PASSWORD === undefined), {
    message: "SMTP_USER and SMTP_PASSWORD must be configured together",
    path: ["SMTP_PASSWORD"],
  })
  .refine((value) => value.SMTP_USER === undefined || value.SMTP_HOST !== undefined, {
    message: "SMTP_HOST is required when SMTP authentication is configured",
    path: ["SMTP_HOST"],
  });

export type LensConfig = z.infer<typeof envSchema>;

export function parseConfig(source: NodeJS.ProcessEnv): LensConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid Anvia Lens configuration: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}
