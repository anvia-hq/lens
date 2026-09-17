import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/.git/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      thresholds: { branches: 85, functions: 90, lines: 90, statements: 90 },
    },
  },
});
