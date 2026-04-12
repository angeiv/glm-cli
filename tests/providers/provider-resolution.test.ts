import { describe, expect, test } from "vitest";
import { resolveRuntimeConfig } from "../../src/app/env.js";
import type { GlmConfigFile } from "../../src/app/config-store.js";
import { resolveProviderSelection } from "../../src/providers/index.js";

function createConfigFile(overrides: Partial<GlmConfigFile> = {}): GlmConfigFile {
  return {
    defaultProvider: overrides.defaultProvider ?? "glm-official",
    defaultModel: overrides.defaultModel ?? "glm-5",
    approvalPolicy: overrides.approvalPolicy ?? "ask",
    providers: {
      glmOfficial: { apiKey: "", baseURL: "" },
      openAICompatible: { apiKey: "", baseURL: "" },
    },
  };
}

describe("resolveProviderSelection", () => {
  test("maps ANTHROPIC_* env to anthropic compatibility mode", () => {
    const resolved = resolveProviderSelection(
      {},
      {
        ANTHROPIC_AUTH_TOKEN: "token",
        ANTHROPIC_BASE_URL: "https://open.bigmodel.cn/api/anthropic",
        ANTHROPIC_MODEL: "glm-5",
      } as NodeJS.ProcessEnv,
      "glm-official",
      "glm-5",
    );

    expect(resolved.provider).toBe("anthropic");
    expect(resolved.model).toBe("glm-5");
  });
});

describe("resolveRuntimeConfig", () => {
  test("prefers compatibility env before file defaults", () => {
    const config = createConfigFile({ defaultProvider: "openai-compatible", defaultModel: "foo" });
    const runtime = resolveRuntimeConfig(
      {},
      {
        ANTHROPIC_AUTH_TOKEN: "token",
        ANTHROPIC_MODEL: "glm-5",
      },
      config,
    );

    expect(runtime.provider).toBe("anthropic");
    expect(runtime.model).toBe("glm-5");
  });

  test("falls back to file default provider when no CLI or compatibility env", () => {
    const config = createConfigFile({ defaultProvider: "openai-compatible", defaultModel: "foo" });
    const runtime = resolveRuntimeConfig({}, {}, config);

    expect(runtime.provider).toBe("openai-compatible");
    expect(runtime.model).toBe("foo");
  });
});
