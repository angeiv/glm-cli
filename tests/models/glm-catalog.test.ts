import { describe, expect, test } from "vitest";
import {
  getStandardGlmModel,
  getGenericOpenAiCompatibleCaps,
} from "../../src/models/glm-catalog.js";

describe("GLM catalog", () => {
  test("returns official glm-5.1 chat capabilities from the catalog", () => {
    const model = getStandardGlmModel("glm-5.1");

    expect(model).toMatchObject({
      id: "glm-5.1",
      displayName: "GLM 5.1",
      source: "official",
      family: "glm-5",
      tier: "flagship",
      contextWindow: 204_800,
      maxOutputTokens: 131_072,
      defaultThinkingMode: "enabled",
      supportsThinking: true,
      supportsPreservedThinking: true,
      supportsToolCall: true,
      supportsToolStream: true,
      supportsCache: true,
      supportsStructuredOutput: true,
    });
  });

  test("returns compat metadata for broader GLM family entries", () => {
    const model = getStandardGlmModel("glm-4.5-airx");

    expect(model).toMatchObject({
      id: "glm-4.5-airx",
      source: "compat",
      family: "glm-4.5",
      tier: "air",
      contextWindow: 131_072,
      maxOutputTokens: 98_304,
    });
  });

  test("exposes generic openai-compatible fallback caps", () => {
    expect(getGenericOpenAiCompatibleCaps()).toMatchObject({
      contextWindow: 128_000,
      maxOutputTokens: 8_192,
      supportsThinking: false,
      supportsPreservedThinking: false,
      supportsToolCall: true,
      supportsToolStream: false,
      supportsCache: false,
      supportsStructuredOutput: false,
    });
  });
});
