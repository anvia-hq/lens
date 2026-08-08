import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    coverage: {
      provider: "v8",
      include: ["src/{hooks,lib}/**/*.ts"],
      thresholds: { branches: 80, functions: 90, lines: 90, statements: 90 },
    },
  },
});
