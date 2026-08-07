import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/.git/**", "test/integration/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      thresholds: { branches: 60, functions: 80, lines: 75, statements: 70 },
    },
  },
});
