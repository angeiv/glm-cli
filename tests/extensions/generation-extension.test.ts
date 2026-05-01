import { describe, expect, test } from "vitest";
import {
  applyGenerationOverrides,
  resolveGenerationOverrides,
} from "../../resources/extensions/glm-generation/index.js";

describe("glm-generation extension", () => {
  test("resolveGenerationOverrides parses env vars", () => {
    const overrides = resolveGenerationOverrides({
      GLM_MAX_OUTPUT_TOKENS: "8192",
      GLM_TEMPERATURE: "0.2",
      GLM_TOP_P: "0.9",
    } as any);

    expect(overrides).toEqual({
      maxOutputTokens: 8192,
      temperature: 0.2,
      topP: 0.9,
    });
  });

  test("applyGenerationOverrides sets max_tokens/temperature/top_p and clamps to model maxTokens", () => {
    const payload = { model: "glm-5.1", max_tokens: 123, temperature: 1 };
    const next = applyGenerationOverrides(
      payload,
      { maxOutputTokens: 10_000, temperature: 0, topP: 0.5 },
      { maxTokens: 4096 },
    ) as any;

    expect(next).toMatchObject({
      model: "glm-5.1",
      max_tokens: 4096,
      temperature: 0,
      top_p: 0.5,
    });
  });
});

test("applyGenerationOverrides uses responses field names for openai-responses models", () => {
  const payload = { model: "glm-5.1", max_output_tokens: 123, temperature: 1 };
  const next = applyGenerationOverrides(
    payload,
    { maxOutputTokens: 10_000, temperature: 0 },
    { api: "openai-responses", maxTokens: 4096 },
  ) as any;

  expect(next).toMatchObject({
    model: "glm-5.1",
    max_output_tokens: 4096,
    temperature: 0,
  });
  expect(next).not.toHaveProperty("max_tokens");
});
