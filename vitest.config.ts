import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
  },
  resolve: {
    alias: {
      "@earendil-works/pi-ai": "@earendil-works/pi-ai",
      "@earendil-works/pi-coding-agent": "@earendil-works/pi-coding-agent",
    },
  },
});
