import { type LensConfig, parseConfig } from "./schema.js";

export type { LensConfig } from "./schema.js";

let cached: LensConfig | undefined;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): LensConfig {
  if (source === process.env && cached !== undefined) return cached;
  const config = parseConfig(source);
  if (source === process.env) cached = config;
  return config;
}
