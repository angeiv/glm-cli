import { describe, expect, test } from "vitest";
import { resolveCanonicalGlmModelId } from "../../src/models/glm-alias.js";

describe("GLM alias resolution", () => {
  test("maps common third-party aliases to canonical GLM ids", () => {
    expect(resolveCanonicalGlmModelId("ZhipuAI/GLM-5")).toBe("glm-5");
    expect(resolveCanonicalGlmModelId("z-ai/glm-5-1")).toBe("glm-5.1");
    expect(resolveCanonicalGlmModelId("glm5")).toBe("glm-5");
    expect(resolveCanonicalGlmModelId("accounts/fireworks/models/glm-5p1")).toBe("glm-5.1");
  });

  test("returns undefined for non-GLM ids", () => {
    expect(resolveCanonicalGlmModelId("claude-opus-4-1")).toBeUndefined();
  });
});
