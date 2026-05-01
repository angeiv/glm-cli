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
    expect(next).not.toHaveProperty("reasoning_effort");
  });

  test("uses maxOutputTokensOverride when payload lacks max token fields", () => {
    const payload = {
      model: "glm-5.1",
      reasoning_effort: "xhigh",
    };

    const next = applyDashscopePayloadPatches(payload, { maxOutputTokensOverride: 32000 }) as any;
    expect(next.thinking_budget).toBe(31999);
  });

  test("clamps thinking_budget against the smallest max token candidate", () => {
    const payload = {
      model: "glm-5.1",
      // Some providers accept both, and downstream layers may override to a smaller max.
      max_completion_tokens: 131072,
      reasoning_effort: "xhigh",
    };

    const next = applyDashscopePayloadPatches(payload, { maxOutputTokensOverride: 32000 }) as any;
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

    const next = applyDashscopePayloadPatches(payload) as any;
    expect(next.thinking_budget).toBe(1000);
    expect(next).not.toHaveProperty("reasoning_effort");
  });

  test("strips reasoning_effort after deriving an explicit Dashscope thinking_budget", () => {
    const payload = {
      model: "glm-5.1",
      max_completion_tokens: 32000,
      reasoning_effort: "xhigh",
    };

    const next = applyDashscopePayloadPatches(payload) as any;
    expect(next).toMatchObject({
      max_completion_tokens: 32000,
      thinking_budget: 31999,
    });
    expect(next).not.toHaveProperty("reasoning_effort");
  });

  test("adds cache_control to the first reusable message when explicit cache is enabled", () => {
    const payload = {
      model: "glm-5.1",
      messages: [
        { role: "system", content: "stable repo and instruction context" },
        { role: "user", content: "what should I do next?" },
      ],
    };

    const next = applyDashscopePayloadPatches(payload, {
      contextCache: "explicit",
      modelId: "glm-5.1",
      supportsCache: true,
    }) as any;

    expect(next.messages[0].content).toEqual([
      {
        type: "text",
        text: "stable repo and instruction context",
        cache_control: { type: "ephemeral" },
      },
    ]);
    expect(next.messages[1].content).toBe("what should I do next?");
  });

  test("does not add explicit cache markers for unsupported models", () => {
    const payload = {
      model: "glm-5",
      messages: [{ role: "system", content: "stable context" }],
    };

    const next = applyDashscopePayloadPatches(payload, {
      contextCache: "explicit",
      modelId: "glm-5",
      supportsCache: false,
    });

    expect(next).toBe(payload);
  });
});
