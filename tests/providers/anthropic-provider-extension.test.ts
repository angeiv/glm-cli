import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, test } from "vitest";
import registerGlmProviders from "../../resources/extensions/glm-providers/index.ts";

const trackedEnvKeys = [
  "GLM_PROVIDER",
  "GLM_API",
  "GLM_MODEL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
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

async function registerProviderByName(
  name: string,
  overrides: Partial<Record<(typeof trackedEnvKeys)[number], string>>,
) {
  withEnv(overrides);

  const registrations: Array<{ name: string; config: Record<string, unknown> }> = [];
  await registerGlmProviders({
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

describe("anthropic-compatible provider registration", () => {
  test("registers a non-GLM ANTHROPIC_MODEL so runtime selection can resolve it", async () => {
    const provider = await registerProviderByName("custom", {
      GLM_PROVIDER: "custom",
      GLM_API: "anthropic",
      ANTHROPIC_AUTH_TOKEN: "token",
      ANTHROPIC_MODEL: "claude-3-7-sonnet-20250219",
    });

    expect(provider).toBeDefined();
    const models = provider!.config.models as Array<{
      id: string;
      name: string;
      reasoning: boolean;
      contextWindow: number;
      maxTokens: number;
    }>;
    expect(models.find((model) => model.id === "claude-3-7-sonnet-20250219")).toMatchObject({
      id: "claude-3-7-sonnet-20250219",
      name: "claude-3-7-sonnet-20250219",
      reasoning: true,
      contextWindow: 128_000,
      maxTokens: 8_192,
    });
  });

  test("keeps built-in GLM metadata when anthropic mode targets known GLM ids", async () => {
    const provider = await registerProviderByName("bigmodel", {
      GLM_PROVIDER: "bigmodel",
      GLM_API: "anthropic",
      ANTHROPIC_AUTH_TOKEN: "token",
      ANTHROPIC_MODEL: "glm-4.5-air",
    });

    expect(provider).toBeDefined();
    const models = provider!.config.models as Array<{
      id: string;
      name: string;
      reasoning: boolean;
    }>;
    expect(models.find((model) => model.id === "glm-4.5-air")).toMatchObject({
      id: "glm-4.5-air",
      name: "GLM 4.5 Air",
      reasoning: true,
    });
  });

  test("uses a custom api adapter for ModelScope anthropic endpoints", async () => {
    const provider = await registerProviderByName("custom", {
      GLM_PROVIDER: "custom",
      GLM_API: "anthropic",
      ANTHROPIC_AUTH_TOKEN: "token",
      ANTHROPIC_MODEL: "ZhipuAI/GLM-5",
      ANTHROPIC_BASE_URL: "https://api-inference.modelscope.cn/",
    });

    expect(provider).toBeDefined();
    expect(provider!.config.api).toBe("anthropic-messages-modelscope");
    expect(typeof provider!.config.streamSimple).toBe("function");
  });

  test("lets provider selection keep native glm capability matching on proxies", async () => {
    const provider = await registerProviderByName("bigmodel", {
      GLM_PROVIDER: "bigmodel",
      GLM_API: "anthropic",
      ANTHROPIC_AUTH_TOKEN: "token",
      ANTHROPIC_MODEL: "glm-5.1",
      ANTHROPIC_BASE_URL: "https://aihub.internal.example/v1/messages",
    });

    expect(provider).toBeDefined();
    const models = provider!.config.models as Array<{
      id: string;
      contextWindow: number;
      maxTokens: number;
    }>;
    expect(models.find((model) => model.id === "glm-5.1")).toMatchObject({
      id: "glm-5.1",
      contextWindow: 204_800,
      maxTokens: 131_072,
    });
  });
});
