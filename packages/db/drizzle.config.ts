import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  out: "./migrations/postgres",
  schema: "./src/schema.ts",
  dbCredentials: {
    url: process.env.POSTGRES_URL ?? "postgresql://lens:lens@localhost:5432/lens",
  },
});
