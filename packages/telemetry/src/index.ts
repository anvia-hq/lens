export type {
  NormalizeEvaluationsResult,
  NormalizeOptions,
  NormalizeResult,
} from "./normalization.js";
export { defaultRedactionPatterns, globMatch } from "./normalization.js";
export { normalizeOtlpLogsRequest } from "./normalize-evaluations.js";
export { normalizeOtlpRequest } from "./normalize-traces.js";
export * from "./transport.js";
export type { OtlpExportRequest } from "./types.js";
