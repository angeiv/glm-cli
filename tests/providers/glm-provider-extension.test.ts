import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, test } from "vitest";
import registerGlmProviders from "../../resources/extensions/glm-providers/index.ts";

const trackedEnvKeys = [
  "GLM_PROVIDER",
  "GLM_API",
  "GLM_API_KEY",
  "GLM_BASE_URL",
  "GLM_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
] as const;

const originalEnv = Object.fromEntries(
  trackedEnvKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof trackedEnvKeys)[number], string | undefined>;

function withEnv(overrides: Partial<Record<(typeof trackedEnvKeys)[number], string>>) {
  for (const key of trackedEnvKeys) {
    delete process.env[key];
    const value = overrides[key];
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}

function registerProviderByName(
  name: string,
  overrides: Partial<Record<(typeof trackedEnvKeys)[number], string>>,
) {
  withEnv(overrides);

  const registrations: Array<{ name: string; config: Record<string, unknown> }> = [];
  registerGlmProviders({
    registerProvider(providerName: string, config: Record<string, unknown>) {
      registrations.push({ name: providerName, config });
    },
  } as unknown as ExtensionAPI);

  return registrations.find((registration) => registration.name === name);
}

afterEach(() => {
  for (const key of trackedEnvKeys) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("provider extension registration", () => {
  test("registers the broader GLM family catalog for official bigmodel providers", () => {
    const provider = registerProviderByName("bigmodel-coding", {
      GLM_PROVIDER: "bigmodel-coding",
      GLM_API_KEY: "token",
    });

    expect(provider).toBeDefined();
    expect(provider!.config.name).toBe("BigModel Coding");
    const models = provider!.config.models as Array<{
      id: string;
      contextWindow: number;
      input: string[];
      thinkingLevelMap?: Record<string, string | null>;
    }>;
    expect(models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "glm-5.1", contextWindow: 204_800, input: ["text"] }),
        expect.objectContaining({ id: "glm-4.5-airx", contextWindow: 131_072 }),
      ]),
    );
    expect(models.find((model) => model.id === "glm-5.1")?.thinkingLevelMap).toMatchObject({
      minimal: null,
      low: null,
      medium: null,
    });
  });

  test("uses canonical GLM metadata for third-party aliases on openrouter", () => {
    const provider = registerProviderByName("openrouter", {
      GLM_PROVIDER: "openrouter",
      OPENAI_API_KEY: "token",
      OPENAI_MODEL: "ZhipuAI/GLM-5",
      OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
    });

    expect(provider).toBeDefined();
    expect(provider!.config.name).toBe("OpenRouter");
    const models = provider!.config.models as Array<{
      id: string;
      contextWindow: number;
      maxTokens: number;
    }>;

    expect(models).toEqual([
      expect.objectContaining({
        id: "ZhipuAI/GLM-5",
        contextWindow: 204_800,
        maxTokens: 131_072,
      }),
    ]);
  });

  test("keeps gateway payload semantics for openrouter-hosted aliases", () => {
    const provider = registerProviderByName("openrouter", {
      GLM_PROVIDER: "openrouter",
      OPENAI_API_KEY: "token",
      OPENAI_MODEL: "z-ai/glm-5.1",
      OPENAI_BASE_URL: "https://aihub.internal.example/v1",
    });

    expect(provider).toBeDefined();
    const models = provider!.config.models as Array<{
      id: string;
      contextWindow: number;
      maxTokens: number;
      compat?: Record<string, unknown>;
    }>;

    expect(models).toEqual([
      expect.objectContaining({
        id: "z-ai/glm-5.1",
        contextWindow: 202_752,
        maxTokens: 131_072,
        compat: expect.objectContaining({
          supportsDeveloperRole: false,
        }),
      }),
    ]);
    expect(models[0].compat).not.toMatchObject({
      thinkingFormat: "zai",
      zaiToolStream: true,
    });
  });

  test("registers qwen metadata with multimodal input on custom responses mode", () => {
    const provider = registerProviderByName("custom", {
      GLM_PROVIDER: "custom",
      GLM_API: "openai-responses",
      OPENAI_API_KEY: "token",
      OPENAI_MODEL: "qwen3.6-plus-2026-04-02",
      OPENAI_BASE_URL: "https://gateway.example.com/v1",
    });

    expect(provider).toBeDefined();
    expect(provider!.config.api).toBe("openai-responses");
    const models = provider!.config.models as Array<{
      id: string;
      input: string[];
      contextWindow: number;
      maxTokens: number;
    }>;

    expect(models).toEqual([
      expect.objectContaining({
        id: "qwen3.6-plus-2026-04-02",
        input: ["text", "image", "video"],
        contextWindow: 1_000_000,
        maxTokens: 65_536,
      }),
    ]);
  });
});
