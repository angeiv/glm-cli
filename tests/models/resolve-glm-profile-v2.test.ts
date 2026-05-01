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
});
