import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/.git/**",
      ...(process.env.LENS_INTEGRATION === "1" ? [] : ["test/integration/**"]),
    ],
    coverage: {
      provider: "v8",
      // These files contain parsing, security, ingestion, and gate-evaluation logic. Routers remain
      // covered by request-level tests without treating framework registration as executable logic.
      include: [
        "src/modules/ingestion/body.ts",
        "src/modules/quality-gates/evaluate.ts",
        "src/modules/{evaluation-runs,sessions,traces,users}/schema.ts",
        "src/utils/security.ts",
      ],
      thresholds: { branches: 70, functions: 90, lines: 85, statements: 80 },
    },
  },
});
