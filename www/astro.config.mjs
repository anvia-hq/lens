import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  markdown: {
    syntaxHighlight: "shiki",
    shikiConfig: {
      theme: "github-dark-default",
      wrap: false,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
