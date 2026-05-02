import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, test } from "vitest";
import registerGlmProviders from "../../resources/extensions/glm-providers/index.ts";

const trackedEnvKeys = [
  "GLM_API_KEY",
  "GLM_BASE_URL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "OPENAI_UPSTREAM_PROVIDER",
  "GLM_MODEL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_UPSTREAM_PROVIDER",
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

function registerAnthropicProvider(
  overrides: Partial<Record<(typeof trackedEnvKeys)[number], string>>,
) {
  withEnv(overrides);

  const registrations: Array<{ name: string; config: Record<string, unknown> }> = [];
  registerGlmProviders({
    registerProvider(name: string, config: Record<string, unknown>) {
      registrations.push({ name, config });
    },
  } as unknown as ExtensionAPI);

  return registrations.find((registration) => registration.name === "anthropic");
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

describe("anthropic provider extension model registration", () => {
  test("registers a non-GLM ANTHROPIC_MODEL so runtime selection can resolve it", () => {
    const requestedModelId = "claude-3-7-sonnet-20250219";
    const anthropic = registerAnthropicProvider({
      ANTHROPIC_AUTH_TOKEN: "token",
      ANTHROPIC_MODEL: requestedModelId,
    });

    expect(anthropic).toBeDefined();
    expect(anthropic!.config.name).toBe("Anthropic Compatible");
    const models = anthropic!.config.models as Array<{
      id: string;
      name: string;
      reasoning: boolean;
      contextWindow: number;
      maxTokens: number;
    }>;
    const requested = models.find((model) => model.id === requestedModelId);

    expect(requested).toMatchObject({
      id: requestedModelId,
      name: requestedModelId,
      reasoning: true,
      contextWindow: 128_000,
      maxTokens: 8_192,
    });
    expect(models.filter((model) => model.id === requestedModelId)).toHaveLength(1);
  });

  test("registers provider when ANTHROPIC_MODEL is set even without auth token", () => {
    const requestedModelId = "ZhipuAI/GLM-5";
    const anthropic = registerAnthropicProvider({
      ANTHROPIC_MODEL: requestedModelId,
    });

    expect(anthropic).toBeDefined();
    const models = anthropic!.config.models as Array<{ id: string }>;
    expect(models.some((model) => model.id === requestedModelId)).toBe(true);
  });

  test("keeps built-in GLM metadata when ANTHROPIC_MODEL matches known GLM ids", () => {
    const requestedModelId = "glm-4.5-air";
    const anthropic = registerAnthropicProvider({
      ANTHROPIC_AUTH_TOKEN: "token",
      ANTHROPIC_MODEL: requestedModelId,
    });

    expect(anthropic).toBeDefined();
    const models = anthropic!.config.models as Array<{
      id: string;
      name: string;
      reasoning: boolean;
    }>;
    const requested = models.find((model) => model.id === requestedModelId);

    expect(requested).toMatchObject({
      id: requestedModelId,
      name: "GLM 4.5 Air",
      reasoning: true,
    });
    expect(models.filter((model) => model.id === requestedModelId)).toHaveLength(1);
  });

  test("uses a custom api adapter for ModelScope anthropic endpoints", () => {
    const requestedModelId = "ZhipuAI/GLM-5";
    const anthropic = registerAnthropicProvider({
      ANTHROPIC_AUTH_TOKEN: "token",
      ANTHROPIC_MODEL: requestedModelId,
      ANTHROPIC_BASE_URL: "https://api-inference.modelscope.cn/",
    });

    expect(anthropic).toBeDefined();
    expect(anthropic!.config.api).toBe("anthropic-messages-modelscope");
    expect(typeof anthropic!.config.streamSimple).toBe("function");
  });

  test("uses explicit upstream provider hints for proxied anthropic-compatible glm models", () => {
    const requestedModelId = "glm-5.1";
    const anthropic = registerAnthropicProvider({
      ANTHROPIC_AUTH_TOKEN: "token",
      ANTHROPIC_MODEL: requestedModelId,
      ANTHROPIC_BASE_URL: "https://aihub.internal.example/v1/messages",
      ANTHROPIC_UPSTREAM_PROVIDER: "modelscope",
    });

    expect(anthropic).toBeDefined();
    const models = anthropic!.config.models as Array<{
      id: string;
      contextWindow: number;
      maxTokens: number;
      upstreamProvider?: string;
    }>;
    const requested = models.find((model) => model.id === requestedModelId);

    expect(requested).toMatchObject({
      id: requestedModelId,
      contextWindow: 204_800,
      maxTokens: 131_072,
      upstreamProvider: "modelscope",
    });
  });
});

describe("openai-responses provider extension registration", () => {
  test("registers openai-responses with shared OPENAI_* credentials", () => {
    const provider = registerProviderByName("openai-responses", {
      OPENAI_API_KEY: "token",
      OPENAI_MODEL: "glm-5.1",
      OPENAI_BASE_URL: "https://example.com/v1",
    });

    expect(provider).toBeDefined();
    expect(provider!.config.name).toBe("OpenAI Responses");
    expect(provider!.config.api).toBe("openai-responses");
    expect(provider!.config.baseUrl).toBe("https://example.com/v1");
    const models = provider!.config.models as Array<{ id: string }>;
    expect(models).toEqual([expect.objectContaining({ id: "glm-5.1" })]);
  });

  test("keeps image input available for unknown openai-responses models", () => {
    const provider = registerProviderByName("openai-responses", {
      OPENAI_API_KEY: "token",
      OPENAI_MODEL: "vendor/some-custom-model",
      OPENAI_BASE_URL: "https://gateway.example.com/v1",
    });

    expect(provider).toBeDefined();
    const models = provider!.config.models as Array<{
      id: string;
      input: string[];
      contextWindow: number;
      maxTokens: number;
    }>;

    expect(models).toEqual([
      expect.objectContaining({
        id: "vendor/some-custom-model",
        input: ["text", "image"],
        contextWindow: 128_000,
        maxTokens: 8_192,
      }),
    ]);
  });

  test("registers qwen multimodal snapshots for openai-responses", () => {
    const provider = registerProviderByName("openai-responses", {
      OPENAI_API_KEY: "token",
      OPENAI_MODEL: "qwen/qwen3.5-plus-20260420",
      OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
    });

    expect(provider).toBeDefined();
    const models = provider!.config.models as Array<{
      id: string;
      input: string[];
      contextWindow: number;
      maxTokens: number;
    }>;

    expect(models).toEqual([
      expect.objectContaining({
        id: "qwen/qwen3.5-plus-20260420",
        input: ["text", "image", "video"],
        contextWindow: 1_000_000,
        maxTokens: 65_536,
      }),
    ]);
  });
});
