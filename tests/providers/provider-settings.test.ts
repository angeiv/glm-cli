import { describe, expect, test } from "vitest";
import { resolveProviderSettings } from "../../resources/extensions/glm-providers/index.ts";

describe("resolveProviderSettings", () => {
  test("prefers env api key over persisted and trims whitespace", () => {
    const resolved = resolveProviderSettings({
      provider: "custom",
      api: "openai-compatible",
      env: { OPENAI_API_KEY: "  env-key  " },
      persisted: { apiKey: "persisted-key", baseURL: "https://persisted.example.com" },
    });

    expect(resolved.apiKey).toBe("env-key");
  });

  test("treats whitespace-only env api key as missing and falls back to persisted", () => {
    const resolved = resolveProviderSettings({
      provider: "custom",
      api: "openai-compatible",
      env: { OPENAI_API_KEY: "   " },
      persisted: { apiKey: "persisted-key", baseURL: "https://persisted.example.com" },
    });

    expect(resolved.apiKey).toBe("persisted-key");
  });

  test("treats empty persisted baseURL as missing and falls back to provider defaults", () => {
    const resolved = resolveProviderSettings({
      provider: "openrouter",
      api: "openai-compatible",
      env: {},
      persisted: { apiKey: "persisted-key", baseURL: "   " },
    });

    expect(resolved.baseUrl).toBe("https://openrouter.ai/api/v1");
  });

  test("prefers env base url over persisted and trims whitespace", () => {
    const resolved = resolveProviderSettings({
      provider: "custom",
      api: "anthropic",
      env: { ANTHROPIC_BASE_URL: "  https://env.example.com/v1  " },
      persisted: { apiKey: "persisted-key", baseURL: "https://persisted.example.com/v1" },
    });

    expect(resolved.baseUrl).toBe("https://env.example.com/v1");
  });

  test("uses glm credential sources for official providers", () => {
    const resolved = resolveProviderSettings({
      provider: "bigmodel-coding",
      api: "openai-compatible",
      env: { GLM_API_KEY: "glm-key" },
      persisted: { apiKey: "persisted-key", baseURL: "" },
    });

    expect(resolved.apiKey).toBe("glm-key");
    expect(resolved.credentialSource).toBe("glm");
  });
});
