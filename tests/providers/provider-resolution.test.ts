import { describe, expect, test } from "vitest";
import { resolveRuntimeConfig } from "../../src/app/env.js";
import type { GlmConfigFile } from "../../src/app/config-store.js";
import { resolveProviderSelection } from "../../src/providers/index.js";

function createConfigFile(overrides: Partial<GlmConfigFile> = {}): GlmConfigFile {
  const providers = {
    bigmodel: { apiKey: "", baseURL: "" },
    "bigmodel-coding": { apiKey: "", baseURL: "" },
    zai: { apiKey: "", baseURL: "" },
    "zai-coding": { apiKey: "", baseURL: "" },
    bailian: { apiKey: "", baseURL: "" },
    "bailian-coding": { apiKey: "", baseURL: "" },
    openrouter: { apiKey: "", baseURL: "" },
    custom: { apiKey: "", baseURL: "" },
  } as GlmConfigFile["providers"];

  return {
    defaultProvider: overrides.defaultProvider ?? "bigmodel-coding",
    defaultApi: overrides.defaultApi ?? "openai-compatible",
    defaultModel: overrides.defaultModel ?? "glm-5",
    approvalPolicy: overrides.approvalPolicy ?? "ask",
    taskLaneDefault: "auto",
    debugRuntime: false,
    eventLogLimit: 200,
    hooksEnabled: true,
    hookTimeoutMs: 5000,
    notifications: { enabled: false, onTurnEnd: true, onLoopResult: true },
    generation: {},
    glmCapabilities: { thinkingMode: "auto", toolStream: "auto", contextCache: "auto" },
    loop: { enabledByDefault: false, profile: "code", maxRounds: 3, failureMode: "handoff", autoVerify: true },
    providers: { ...providers, ...(overrides.providers ?? {}) },
  };
}

describe("resolveProviderSelection", () => {
  test("maps ANTHROPIC_* env to custom provider with anthropic api", () => {
    const resolved = resolveProviderSelection(
      {},
      {
        ANTHROPIC_AUTH_TOKEN: "token",
        ANTHROPIC_BASE_URL: "https://api-inference.modelscope.cn/v1/messages",
        ANTHROPIC_MODEL: "ZhipuAI/GLM-5",
      } as NodeJS.ProcessEnv,
      "bigmodel-coding",
      "glm-5.1",
      "openai-compatible",
    );

    expect(resolved.provider).toBe("custom");
    expect(resolved.api).toBe("anthropic");
    expect(resolved.model).toBe("ZhipuAI/GLM-5");
  });

  test("treats legacy GLM_PROVIDER=openai-responses as custom responses mode", () => {
    const resolved = resolveProviderSelection(
      {},
      {
        GLM_PROVIDER: "openai-responses",
        OPENAI_MODEL: "z-ai/glm-5.1",
      } as NodeJS.ProcessEnv,
      "bigmodel-coding",
      "glm-5.1",
      "openai-compatible",
    );

    expect(resolved.provider).toBe("custom");
    expect(resolved.api).toBe("openai-responses");
    expect(resolved.model).toBe("z-ai/glm-5.1");
  });

  test("keeps openai credential autodetection on custom/openai defaults", () => {
    const resolved = resolveProviderSelection(
      {},
      { OPENAI_API_KEY: "key", OPENAI_MODEL: "qwen/qwen3.5-plus" } as NodeJS.ProcessEnv,
      "custom",
      "glm-5.1",
      "openai-compatible",
    );

    expect(resolved.provider).toBe("custom");
    expect(resolved.api).toBe("openai-compatible");
    expect(resolved.model).toBe("qwen/qwen3.5-plus");
  });
});

describe("resolveRuntimeConfig", () => {
  test("prefers explicit cli provider/api over env and file config", () => {
    const config = createConfigFile({
      defaultProvider: "openrouter",
      defaultApi: "openai-responses",
      defaultModel: "foo",
    });
    const runtime = resolveRuntimeConfig(
      { provider: "bigmodel", api: "anthropic", model: "glm-5", yolo: true },
      {
        GLM_PROVIDER: "custom",
        GLM_API: "openai-compatible",
        GLM_MODEL: "glm-4.5",
      },
      config,
    );

    expect(runtime.provider).toBe("bigmodel");
    expect(runtime.api).toBe("anthropic");
    expect(runtime.model).toBe("glm-5");
    expect(runtime.approvalPolicy).toBe("never");
  });

  test("falls back to file default provider/api when no CLI or env selection exists", () => {
    const config = createConfigFile({
      defaultProvider: "openrouter",
      defaultApi: "openai-responses",
      defaultModel: "foo",
    });
    const runtime = resolveRuntimeConfig({}, {}, config);

    expect(runtime.provider).toBe("openrouter");
    expect(runtime.api).toBe("openai-responses");
    expect(runtime.model).toBe("foo");
  });

  test("lets custom defaults keep anthropic env model selection", () => {
    const config = createConfigFile({
      defaultProvider: "custom",
      defaultApi: "anthropic",
      defaultModel: "foo",
    });
    const runtime = resolveRuntimeConfig(
      {},
      {
        ANTHROPIC_AUTH_TOKEN: "token",
        ANTHROPIC_MODEL: "claude-opus-4-6",
      },
      config,
    );

    expect(runtime.provider).toBe("custom");
    expect(runtime.api).toBe("anthropic");
    expect(runtime.model).toBe("claude-opus-4-6");
  });

  test("maps legacy env provider aliases to canonical service providers", () => {
    const config = createConfigFile();
    const runtime = resolveRuntimeConfig(
      {},
      {
        GLM_PROVIDER: "glm",
        GLM_MODEL: "glm-5.1",
      },
      config,
    );

    expect(runtime.provider).toBe("bigmodel-coding");
    expect(runtime.api).toBe("openai-compatible");
    expect(runtime.model).toBe("glm-5.1");
  });
});
