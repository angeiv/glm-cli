import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, test } from "vitest";
import registerGlmProviders from "../../resources/extensions/glm-providers/index.ts";

const trackedEnvKeys = [
  "GLM_API_KEY",
  "GLM_BASE_URL",
  "GLM_ENDPOINT",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "GLM_MODEL",
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

describe("glm provider extension", () => {
  test("registers the broader GLM family catalog for the native glm provider", () => {
    const provider = registerProviderByName("glm", {
      GLM_API_KEY: "token",
    });

    expect(provider).toBeDefined();
    const models = provider!.config.models as Array<{
      id: string;
      contextWindow: number;
      input: string[];
    }>;
    expect(models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "glm-5.1", contextWindow: 204_800, input: ["text"] }),
        expect.objectContaining({ id: "glm-4.5-airx", contextWindow: 131_072 }),
      ]),
    );
  });

  test("uses canonical GLM metadata for third-party aliases on openai-compatible", () => {
    const provider = registerProviderByName("openai-compatible", {
      OPENAI_API_KEY: "token",
      OPENAI_MODEL: "ZhipuAI/GLM-5",
      OPENAI_BASE_URL: "https://gateway.example.com/v1",
    });

    expect(provider).toBeDefined();
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

  test("applies gateway-specific variant overrides without enabling native payload semantics", () => {
    const provider = registerProviderByName("openai-compatible", {
      OPENAI_API_KEY: "token",
      OPENAI_MODEL: "z-ai/glm-5.1",
      OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
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

  test("falls back to generic caps for unknown models on unknown gateways", () => {
    const provider = registerProviderByName("openai-compatible", {
      OPENAI_API_KEY: "token",
      OPENAI_MODEL: "vendor/some-custom-model",
      OPENAI_BASE_URL: "https://gateway.example.com/v1",
    });

    expect(provider).toBeDefined();
    const models = provider!.config.models as Array<{
      id: string;
      contextWindow: number;
      maxTokens: number;
      input: string[];
    }>;

    expect(models).toEqual([
      expect.objectContaining({
        id: "vendor/some-custom-model",
        contextWindow: 128_000,
        maxTokens: 8_192,
        input: ["text", "image"],
      }),
    ]);
  });

  test("registers built-in qwen metadata with multimodal input and qwen thinking compat", () => {
    const provider = registerProviderByName("openai-compatible", {
      OPENAI_API_KEY: "token",
      OPENAI_MODEL: "Qwen-3.5-122B-A10B",
      OPENAI_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });

    expect(provider).toBeDefined();
    const models = provider!.config.models as Array<{
      id: string;
      contextWindow: number;
      maxTokens: number;
      input: string[];
      compat?: Record<string, unknown>;
    }>;

    expect(models).toEqual([
      expect.objectContaining({
        id: "Qwen-3.5-122B-A10B",
        contextWindow: 262_144,
        maxTokens: 81_920,
        input: ["text", "image"],
        compat: expect.objectContaining({
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          thinkingFormat: "qwen-chat-template",
        }),
      }),
    ]);
  });
});
