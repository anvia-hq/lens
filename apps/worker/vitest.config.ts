import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/{outbox-dispatcher,processors}.ts"],
      thresholds: { branches: 85, functions: 90, lines: 90, statements: 90 },
    },
  },
});
