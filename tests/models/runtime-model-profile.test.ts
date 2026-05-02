import { describe, expect, test } from "vitest";
import {
  resolveProviderTransport,
  resolveRuntimeModelProfile,
} from "../../src/models/runtime-model-profile.js";

describe("runtime model profile", () => {
  test("resolves native BigModel runtime profile metadata", () => {
    const profile = resolveRuntimeModelProfile({
      provider: "bigmodel",
      api: "openai-compatible",
      modelId: "glm-5.1",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4/",
    });

    expect(profile.family).toBe("glm");
    expect(profile.transport).toBe("openai-completions");
    expect(profile.gateway).toBe("native-bigmodel");
    expect(profile.patchPipeline).toEqual({
      zhipuNative: true,
      dashscopeCompat: false,
    });
  });

  test("resolves Bailian-hosted qwen runtime profile metadata", () => {
    const profile = resolveRuntimeModelProfile({
      provider: "bailian",
      api: "openai-compatible",
      modelId: "qwen/qwen3.5-122b-a10b",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });

    expect(profile.family).toBe("qwen");
    expect(profile.transport).toBe("openai-completions");
    expect(profile.gateway).toBe("gateway-dashscope");
    expect(profile.patchPipeline).toEqual({
      zhipuNative: false,
      dashscopeCompat: true,
    });
  });

  test("resolves anthropic transport for modelscope anthropic-compatible routes", () => {
    expect(resolveProviderTransport("anthropic")).toBe("anthropic-messages");

    const profile = resolveRuntimeModelProfile({
      provider: "custom",
      api: "anthropic",
      modelId: "ZhipuAI/GLM-5",
      baseUrl: "https://api-inference.modelscope.cn/v1/messages",
      overrides: [
        {
          match: {
            provider: "custom",
            api: "anthropic",
            baseUrl: "*modelscope.cn*",
            modelId: "ZhipuAI/GLM-5*",
          },
          canonicalModelId: "glm-5",
        },
      ],
    });

    expect(profile.family).toBe("glm");
    expect(profile.transport).toBe("anthropic-messages");
    expect(profile.gateway).toBe("gateway-modelscope-openai");
    expect(profile.patchPipeline).toEqual({
      zhipuNative: false,
      dashscopeCompat: false,
    });
  });

  test("uses anthropic-oriented generic defaults for unknown anthropic models", () => {
    const profile = resolveRuntimeModelProfile({
      provider: "custom",
      api: "anthropic",
      modelId: "claude-3-7-sonnet-20250219",
      baseUrl: "https://api.anthropic.com/v1/messages",
    });

    expect(profile.family).toBe("generic");
    expect(profile.transport).toBe("anthropic-messages");
    expect(profile.effectiveCaps.supportsThinking).toBe(true);
    expect(profile.effectiveCaps.defaultThinkingMode).toBe("enabled");
  });

  test("uses provider selection to classify openrouter-hosted aliases", () => {
    const profile = resolveRuntimeModelProfile({
      provider: "openrouter",
      api: "openai-compatible",
      modelId: "z-ai/glm-5.1",
      baseUrl: "https://aihub.internal.example/v1",
    });

    expect(profile.gateway).toBe("gateway-openrouter");
    expect(profile.effectiveCaps.contextWindow).toBe(202_752);
    expect(profile.payloadPatchPolicy).toBe("safe-openai-compatible");
    expect(profile.patchPipeline).toEqual({
      zhipuNative: false,
      dashscopeCompat: false,
    });
  });

  test("allows provider selection to keep native glm payload semantics on proxies", () => {
    const profile = resolveRuntimeModelProfile({
      provider: "bigmodel",
      api: "openai-compatible",
      modelId: "glm-5.1",
      baseUrl: "https://aihub.internal.example/v1",
    });

    expect(profile.gateway).toBe("native-bigmodel");
    expect(profile.payloadPatchPolicy).toBe("glm-native");
    expect(profile.patchPipeline).toEqual({
      zhipuNative: true,
      dashscopeCompat: false,
    });
  });
});
