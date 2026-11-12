import { type LensConfig, parseConfig } from "./schema.js";

export type { LensConfig } from "./schema.js";

let processConfig: LensConfig | undefined;

/** Parses `source` on every call. Nothing is cached. */
export function loadConfig(source: NodeJS.ProcessEnv): LensConfig {
  return parseConfig(source);
}

/**
 * Parses `process.env` on first call and returns that same config afterwards,
 * so later changes to `process.env` are not picked up.
 */
export function loadProcessConfig(): LensConfig {
  processConfig ??= parseConfig(process.env);
  return processConfig;
}
