import { describe, expect, test } from "vitest";
import {
  applyZhipuPayloadPatches,
  shouldApplyGlmNativePayloadPatches,
} from "../../resources/extensions/glm-zhipu/index.js";

describe("glm-zhipu extension", () => {
  test("applyZhipuPayloadPatches converts thinking + max tokens + strips strict/tool_stream", () => {
    const payload = {
      model: "glm-5.1",
      stream: false,
      tool_stream: true,
      enable_thinking: true,
      max_completion_tokens: 123,
      store: false,
      stream_options: { include_usage: true },
      tools: [
        {
          type: "function",
          function: {
            name: "demo",
            parameters: { type: "object", properties: {} },
            strict: false,
          },
        },
      ],
    };

    const next = applyZhipuPayloadPatches(payload, { clearThinking: false }) as any;

    expect(next).toMatchObject({
      model: "glm-5.1",
      stream: false,
      max_tokens: 123,
      thinking: { type: "enabled", clear_thinking: false },
      tools: [
        {
          type: "function",
          function: {
            name: "demo",
          },
        },
      ],
    });

    expect(next).not.toHaveProperty("enable_thinking");
    expect(next).not.toHaveProperty("max_completion_tokens");
    expect(next).not.toHaveProperty("tool_stream");
    expect(next).not.toHaveProperty("store");
    expect(next).not.toHaveProperty("stream_options");
    expect(next.tools[0].function).not.toHaveProperty("strict");
  });

  test("applyZhipuPayloadPatches maps reasoning_effort to thinking", () => {
    const payload = {
      model: "glm-5.1",
      reasoning_effort: "none",
    };

    const next = applyZhipuPayloadPatches(payload, {}) as any;
    expect(next.thinking).toEqual({ type: "disabled" });
    expect(next).not.toHaveProperty("reasoning_effort");
  });

  test("applyZhipuPayloadPatches enables tool streaming when configured", () => {
    const payload = {
      model: "glm-5.1",
      stream: true,
      tools: [
        {
          type: "function",
          function: {
            name: "demo",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
    };

    const next = applyZhipuPayloadPatches(payload, { toolStream: "on" }) as any;
    expect(next.tool_stream).toBe(true);
  });

  test("applyZhipuPayloadPatches avoids tool_stream when the resolved model profile does not support it", () => {
    const payload = {
      model: "glm-4.5-air",
      stream: true,
      tools: [
        {
          type: "function",
          function: {
            name: "demo",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
    };

    const next = applyZhipuPayloadPatches(
      payload,
      { toolStream: "on" },
      {
        provider: "glm",
        id: "glm-4.5-air",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4/",
      },
    ) as any;

    expect(next).not.toHaveProperty("tool_stream");
  });

  test("applyZhipuPayloadPatches can force thinking without pi toggles", () => {
    const payload = {
      model: "glm-5.1",
      messages: [{ role: "user", content: "hi" }],
    };

    const next = applyZhipuPayloadPatches(payload, {
      thinkingMode: "enabled",
      clearThinking: true,
    }) as any;

    expect(next.thinking).toEqual({
      type: "enabled",
      clear_thinking: true,
    });
  });

  test("only enables native payload patches for known native GLM routes", () => {
    expect(
      shouldApplyGlmNativePayloadPatches({
        id: "glm-5.1",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4/",
        api: "openai-completions",
      }),
    ).toBe(true);

    expect(
      shouldApplyGlmNativePayloadPatches({
        id: "z-ai/glm-5.1",
        baseUrl: "https://openrouter.ai/api/v1",
        api: "openai-completions",
      }),
    ).toBe(false);

    expect(
      shouldApplyGlmNativePayloadPatches({
        id: "ZhipuAI/GLM-5",
        baseUrl: "https://gateway.example.com/v1",
        api: "openai-completions",
      }),
    ).toBe(false);
  });
});
