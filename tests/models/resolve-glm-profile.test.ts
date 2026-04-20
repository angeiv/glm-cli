import { describe, expect, test } from "vitest";
import { resolveGlmProfile } from "../../src/models/resolve-glm-profile.js";

describe("GLM profile resolution", () => {
  test("uses native GLM payload policy on official BigModel routes", () => {
    const profile = resolveGlmProfile({
      modelId: "glm-5.1",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4/",
    });

    expect(profile).toMatchObject({
      canonicalModelId: "glm-5.1",
      payloadPatchPolicy: "glm-native",
      evidence: {
        modelAlias: "matched",
        platform: "native-bigmodel",
        confidence: "high",
      },
      effectiveCaps: {
        contextWindow: 204_800,
        maxOutputTokens: 131_072,
        supportsPreservedThinking: true,
      },
    });
  });

  test("keeps safe openai-compatible behavior for gateway-hosted GLM aliases", () => {
    const profile = resolveGlmProfile({
      modelId: "z-ai/glm-5.1",
      baseUrl: "https://openrouter.ai/api/v1",
    });

    expect(profile).toMatchObject({
      canonicalModelId: "glm-5.1",
      payloadPatchPolicy: "safe-openai-compatible",
      evidence: {
        modelAlias: "matched",
        platform: "gateway-openrouter",
        upstreamVendor: "z-ai",
      },
    });
    expect(profile.effectiveCaps.contextWindow).toBe(202_752);
  });

  test("falls back to generic caps when evidence is insufficient", () => {
    const profile = resolveGlmProfile({
      modelId: "vendor/some-custom-model",
      baseUrl: "https://gateway.example.com/v1",
    });

    expect(profile.canonicalModelId).toBeUndefined();
    expect(profile.payloadPatchPolicy).toBe("safe-openai-compatible");
    expect(profile.evidence).toMatchObject({
      modelAlias: "none",
      platform: "gateway-other",
      confidence: "low",
    });
    expect(profile.effectiveCaps).toMatchObject({
      contextWindow: 128_000,
      maxOutputTokens: 8_192,
      supportsPreservedThinking: false,
    });
  });
});
