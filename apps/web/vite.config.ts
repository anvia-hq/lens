import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tanstackRouter(), react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
});
