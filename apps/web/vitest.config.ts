import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      // Keep transformation and formatting logic on a strict ratchet while component behavior is
      // exercised by the colocated request/render tests.
      include: [
        "src/utils/format.ts",
        "src/modules/projects/utils.ts",
        "src/modules/observability/utils.ts",
        "src/modules/observability/utils/{session,trace-detail}.ts",
      ],
      thresholds: { branches: 65, functions: 75, lines: 80, statements: 75 },
    },
  },
});
