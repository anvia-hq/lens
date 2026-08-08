import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("/@tanstack/")) {
            return "tanstack-vendor";
          }

          if (/\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?react(?:-dom)?\//.test(id)) {
            return "react-vendor";
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
});
