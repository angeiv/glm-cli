import { describe, expect, test } from "vitest";
import {
  resolveProviderTransport,
  resolveRuntimeModelProfile,
} from "../../src/models/runtime-model-profile.js";

describe("runtime model profile", () => {
  test("resolves native GLM runtime profile metadata", () => {
    const profile = resolveRuntimeModelProfile({
      provider: "glm",
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

  test("resolves dashscope-hosted qwen runtime profile metadata", () => {
    const profile = resolveRuntimeModelProfile({
      provider: "openai-compatible",
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
    const transport = resolveProviderTransport(
      "anthropic",
      "https://api-inference.modelscope.cn/v1",
    );
    expect(transport).toBe("anthropic-messages");

    const profile = resolveRuntimeModelProfile({
      provider: "anthropic",
      modelId: "ZhipuAI/GLM-5",
      baseUrl: "https://api-inference.modelscope.cn/v1/messages",
      overrides: [
        {
          match: {
            provider: "anthropic",
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
      provider: "anthropic",
      modelId: "claude-3-7-sonnet-20250219",
      baseUrl: "https://api.anthropic.com/v1/messages",
    });

    expect(profile.family).toBe("generic");
    expect(profile.transport).toBe("anthropic-messages");
    expect(profile.effectiveCaps.supportsThinking).toBe(true);
    expect(profile.effectiveCaps.defaultThinkingMode).toBe("enabled");
  });
});
