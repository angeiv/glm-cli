import { describe, expect, test } from "vitest";
import { resolveGlmProfile } from "../../src/models/resolve-glm-profile.js";
import { resolveGlmProfileV2 } from "../../src/models/resolve-glm-profile-v2.js";

describe("GLM profile resolution v2", () => {
  test("matches v1 results when no overrides are provided", () => {
    const native = {
      modelId: "glm-5.1",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4/",
    };
    const gateway = {
      modelId: "z-ai/glm-5.1",
      baseUrl: "https://openrouter.ai/api/v1",
    };
    const unknown = {
      modelId: "vendor/some-custom-model",
      baseUrl: "https://gateway.example.com/v1",
    };

    expect(resolveGlmProfileV2(native)).toEqual(resolveGlmProfile(native));
    expect(resolveGlmProfileV2(gateway)).toEqual(resolveGlmProfile(gateway));
    expect(resolveGlmProfileV2(unknown)).toEqual(resolveGlmProfile(unknown));
  });

  test("supports wildcard overrides for unknown gateway model names", () => {
    const profile = resolveGlmProfileV2({
      provider: "anthropic",
      modelId: "ZhipuAI/GLM-5-Long",
      baseUrl: "https://api-inference.modelscope.cn/v1/messages",
      overrides: [
        {
          match: {
            provider: "anthropic",
            baseUrl: "*modelscope.cn*",
            modelId: "ZhipuAI/GLM-5*",
          },
          canonicalModelId: "glm-5",
          caps: {
            contextWindow: 96_000,
            supportsToolStream: false,
          },
        },
      ],
    });

    expect(profile.canonicalModelId).toBe("glm-5");
    expect(profile.payloadPatchPolicy).toBe("safe-openai-compatible");
    expect(profile.evidence).toMatchObject({
      modelAlias: "matched",
      platform: "gateway-modelscope-openai",
      confidence: "medium",
    });
    expect(profile.effectiveCaps.contextWindow).toBe(96_000);
    expect(profile.effectiveCaps.supportsToolStream).toBe(false);
  });

  test("resolves built-in qwen multimodal metadata for qwen/qwen3.5-122b-a10b", () => {
    const profile = resolveGlmProfileV2({
      provider: "openai-compatible",
      modelId: "qwen/qwen3.5-122b-a10b",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });

    expect(profile.canonicalModelId).toBe("qwen/qwen3.5-122b-a10b");
    expect(profile.payloadPatchPolicy).toBe("safe-openai-compatible");
    expect(profile.effectiveModalities).toEqual(["text", "image", "video"]);
    expect(profile.effectiveCaps).toMatchObject({
      contextWindow: 262_144,
      maxOutputTokens: 65_536,
      supportsThinking: true,
      defaultThinkingMode: "enabled",
      supportsStreaming: true,
      supportsToolCall: true,
    });
  });

  test("resolves qwen aliases with case and separator variations", () => {
    const aliases = [
      "Qwen/Qwen3.5-122B-A10B",
      "qwen-3.5-122b-a10b",
      "QWEN_3_5_122B_A10B",
      "vendor/Qwen-3.5-122B-A10B",
    ];

    for (const modelId of aliases) {
      const profile = resolveGlmProfileV2({
        provider: "openai-compatible",
        modelId,
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      });

      expect(profile.canonicalModelId, modelId).toBe("qwen/qwen3.5-122b-a10b");
      expect(profile.effectiveModalities, modelId).toEqual(["text", "image", "video"]);
    }
  });

  test("resolves qwen 3.5 and 3.6 stable and snapshot aliases to canonical profiles", () => {
    const cases = [
      ["qwen3.5-plus", "qwen/qwen3.5-plus"],
      ["qwen/qwen3.5-plus-02-15", "qwen/qwen3.5-plus"],
      ["qwen/qwen3.5-plus-20260420", "qwen/qwen3.5-plus"],
      ["qwen3.6-plus-2026-04-02", "qwen/qwen3.6-plus"],
      ["qwen3.6-flash-2026-04-16", "qwen/qwen3.6-flash"],
    ] as const;

    for (const [modelId, canonicalModelId] of cases) {
      const profile = resolveGlmProfileV2({
        provider: "openai-compatible",
        modelId,
        baseUrl: "https://openrouter.ai/api/v1",
      });

      expect(profile.canonicalModelId, modelId).toBe(canonicalModelId);
      expect(profile.effectiveModalities, modelId).toEqual(["text", "image", "video"]);
    }
  });

  test("applies openrouter-specific qwen 3.6 35b capability differences", () => {
    const profile = resolveGlmProfileV2({
      provider: "openai-compatible",
      modelId: "qwen/qwen3.6-35b-a3b",
      baseUrl: "https://openrouter.ai/api/v1",
    });

    expect(profile.canonicalModelId).toBe("qwen/qwen3.6-35b-a3b");
    expect(profile.effectiveModalities).toEqual(["text", "image", "video"]);
    expect(profile.effectiveCaps).toMatchObject({
      contextWindow: 262_144,
      maxOutputTokens: 65_536,
      supportsStructuredOutput: true,
      supportsToolCall: false,
    });
  });
});
