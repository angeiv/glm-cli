import { describe, expect, test } from "vitest";
import {
  applyDashscopePayloadPatches,
  isDashscopeBaseUrl,
} from "../../resources/extensions/glm-dashscope/index.js";

describe("glm-dashscope extension", () => {
  test("recognizes dashscope base urls", () => {
    expect(isDashscopeBaseUrl("https://dashscope.aliyuncs.com/compatible-mode/v1/")).toBe(true);
    expect(isDashscopeBaseUrl("https://bailian.aliyuncs.com/v1/")).toBe(true);
    expect(isDashscopeBaseUrl("https://api.openai.com/v1/")).toBe(false);
  });

  test("injects thinking_budget when reasoning_effort implies thinking", () => {
    const payload = {
      model: "glm-5.1",
      max_completion_tokens: 32000,
      reasoning_effort: "medium",
    };

    const next = applyDashscopePayloadPatches(payload) as any;
    expect(next).toMatchObject({
      max_completion_tokens: 32000,
      thinking_budget: 8192,
    });
  });

  test("clamps thinking_budget so max_completion_tokens stays greater", () => {
    const payload = {
      model: "glm-5.1",
      max_completion_tokens: 32000,
      reasoning_effort: "xhigh",
    };

    const next = applyDashscopePayloadPatches(payload) as any;
    expect(next.thinking_budget).toBe(31999);
  });

  test("does not modify payload when thinking is disabled", () => {
    const payload = {
      model: "glm-5.1",
      max_completion_tokens: 32000,
    };

    const next = applyDashscopePayloadPatches(payload);
    expect(next).toBe(payload);
  });

  test("keeps an existing valid thinking_budget unchanged", () => {
    const payload = {
      model: "glm-5.1",
      max_completion_tokens: 32000,
      reasoning_effort: "high",
      thinking_budget: 1000,
    };

    const next = applyDashscopePayloadPatches(payload);
    expect(next).toBe(payload);
  });
});

