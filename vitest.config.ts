import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
  },
  resolve: {
    alias: {
      "@mariozechner/pi-ai": "@mariozechner/pi-ai",
      "@mariozechner/pi-coding-agent": "@mariozechner/pi-coding-agent",
    },
  },
});
