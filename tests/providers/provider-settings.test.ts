import { describe, expect, test } from "vitest";
import { resolveProviderSettings } from "../../resources/extensions/glm-providers/index.ts";

describe("resolveProviderSettings", () => {
  test("prefers env api key over persisted and trims whitespace", () => {
    const resolved = resolveProviderSettings({
      envApiKey: "  env-key  ",
      persisted: { apiKey: "persisted-key", baseURL: "https://persisted.example.com" },
      defaultBaseUrl: "https://default.example.com",
    });

    expect(resolved.apiKey).toBe("env-key");
  });

  test("treats whitespace-only env api key as missing and falls back to persisted", () => {
    const resolved = resolveProviderSettings({
      envApiKey: "   ",
      persisted: { apiKey: "persisted-key", baseURL: "https://persisted.example.com" },
      defaultBaseUrl: "https://default.example.com",
    });

    expect(resolved.apiKey).toBe("persisted-key");
  });

  test("treats empty/whitespace persisted baseURL as missing and falls back to default base url", () => {
    const resolved = resolveProviderSettings({
      persisted: { apiKey: "persisted-key", baseURL: "   " },
      defaultBaseUrl: "https://default.example.com",
    });

    expect(resolved.baseUrl).toBe("https://default.example.com");
  });

  test("prefers env base url over persisted and trims whitespace", () => {
    const resolved = resolveProviderSettings({
      envBaseUrl: "  https://env.example.com  ",
      persisted: { apiKey: "persisted-key", baseURL: "https://persisted.example.com" },
      defaultBaseUrl: "https://default.example.com",
    });

    expect(resolved.baseUrl).toBe("https://env.example.com");
  });
});
