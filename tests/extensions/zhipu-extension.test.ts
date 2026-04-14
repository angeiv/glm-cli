import { describe, expect, test } from "vitest";
import { applyZhipuPayloadPatches } from "../../resources/extensions/glm-zhipu/index.js";

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
});

