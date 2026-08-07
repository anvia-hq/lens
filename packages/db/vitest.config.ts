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
      include: ["src/**/*.ts"],
      exclude: ["src/migrate.ts", "src/seed.ts", "src/seed-runner.ts"],
      thresholds: { branches: 65, functions: 80, lines: 80, statements: 80 },
    },
  },
});
