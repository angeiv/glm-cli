import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, test } from "vitest";
import registerGlmProviders from "../../resources/extensions/glm-providers/index.ts";

const trackedEnvKeys = [
  "GLM_API_KEY",
  "GLM_BASE_URL",
  "GLM_ENDPOINT",
  "GLM_UPSTREAM_PROVIDER",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "OPENAI_UPSTREAM_PROVIDER",
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
    expect(provider!.config.name).toBe("GLM");
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
    const glm51 = models.find((model) => model.id === "glm-5.1") as
      | {
          thinkingLevelMap?: Record<string, string | null>;
        }
      | undefined;
    expect(glm51?.thinkingLevelMap).toMatchObject({
      minimal: null,
      low: null,
      medium: null,
    });
    expect(glm51?.thinkingLevelMap).not.toHaveProperty("xhigh");
  });

  test("uses canonical GLM metadata for third-party aliases on openai-compatible", () => {
    const provider = registerProviderByName("openai-compatible", {
      OPENAI_API_KEY: "token",
      OPENAI_MODEL: "ZhipuAI/GLM-5",
      OPENAI_BASE_URL: "https://gateway.example.com/v1",
    });

    expect(provider).toBeDefined();
    expect(provider!.config.name).toBe("OpenAI Compatible");
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

  test("uses explicit upstream provider hints when the base url is a proxy", () => {
    const provider = registerProviderByName("openai-compatible", {
      OPENAI_API_KEY: "token",
      OPENAI_MODEL: "z-ai/glm-5.1",
      OPENAI_BASE_URL: "https://aihub.internal.example/v1",
      OPENAI_UPSTREAM_PROVIDER: "openrouter",
    });

    expect(provider).toBeDefined();
    const models = provider!.config.models as Array<{
      id: string;
      contextWindow: number;
      maxTokens: number;
      compat?: Record<string, unknown>;
      upstreamProvider?: string;
    }>;

    expect(models).toEqual([
      expect.objectContaining({
        id: "z-ai/glm-5.1",
        contextWindow: 202_752,
        maxTokens: 131_072,
        upstreamProvider: "openrouter",
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
      OPENAI_MODEL: "qwen3.6-plus-2026-04-02",
      OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
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
        id: "qwen3.6-plus-2026-04-02",
        contextWindow: 1_000_000,
        maxTokens: 65_536,
        input: ["text", "image", "video"],
        thinkingLevelMap: expect.objectContaining({
          minimal: null,
          low: null,
          medium: null,
        }),
        compat: expect.objectContaining({
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          thinkingFormat: "qwen-chat-template",
        }),
      }),
    ]);
  });

  test("registers restricted thinking levels for openai-responses gateway models", () => {
    const provider = registerProviderByName("openai-responses", {
      OPENAI_API_KEY: "token",
      OPENAI_MODEL: "glm-5.1",
      OPENAI_BASE_URL: "https://gateway.example.com/v1",
    });

    expect(provider).toBeDefined();
    const models = provider!.config.models as Array<{
      id: string;
      thinkingLevelMap?: Record<string, string | null>;
    }>;

    expect(models).toEqual([
      expect.objectContaining({
        id: "glm-5.1",
        thinkingLevelMap: expect.objectContaining({
          minimal: null,
          low: null,
          medium: null,
        }),
      }),
    ]);
    expect(models[0].thinkingLevelMap).not.toHaveProperty("xhigh");
  });
});
