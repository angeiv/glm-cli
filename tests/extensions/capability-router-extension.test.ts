import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, test, vi } from "vitest";

const readGlmModelRoutingConfigMock = vi.fn(() => undefined);

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
  readGlmModelRoutingConfigMock.mockReset();
  readGlmModelRoutingConfigMock.mockReturnValue(undefined);
});

vi.mock("../../resources/extensions/shared/glm-user-config.js", () => ({
  readGlmModelRoutingConfig: readGlmModelRoutingConfigMock,
}));

describe("glm-capability-router extension", () => {
  test("suggests a configured vision fallback when the current model does not support images", async () => {
    readGlmModelRoutingConfigMock.mockReturnValue({
      visionFallback: {
        mode: "suggest",
        provider: "openai-compatible",
        model: "qwen/qwen3.6-plus",
      },
    });

    const { default: registerCapabilityRouterExtension } = await import(
      "../../resources/extensions/glm-capability-router/index.ts"
    );

    const handlers = new Map<string, (...args: any[]) => any>();
    const notify = vi.fn();
    const setStatus = vi.fn();
    const setModel = vi.fn();
    registerCapabilityRouterExtension({
      on: (event: string, handler: (...args: any[]) => any) => {
        handlers.set(event, handler);
      },
      setModel,
    } as unknown as ExtensionAPI);

    const input = handlers.get("input");
    expect(input).toBeTypeOf("function");

    const result = await input?.(
      {
        type: "input",
        text: "describe this screenshot",
        images: [{ type: "image", mimeType: "image/png", data: "abc" }],
        source: "interactive",
      },
      {
        hasUI: true,
        ui: { notify, setStatus },
        model: {
          provider: "glm",
          id: "glm-5.1",
          input: ["text"],
        },
        modelRegistry: {
          find: vi.fn(),
        },
      },
    );

    expect(result).toEqual({ action: "continue" });
    expect(setModel).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      "Current model does not support image input. Suggested fallback: openai-compatible/qwen/qwen3.6-plus.",
      "warning",
    );
    expect(setStatus).toHaveBeenCalledWith(
      "glm.routing",
      "vision fallback: suggest -> openai-compatible/qwen/qwen3.6-plus",
    );
  });

  test("routes to the configured vision fallback model when routing is enabled", async () => {
    readGlmModelRoutingConfigMock.mockReturnValue({
      visionFallback: {
        mode: "route",
        provider: "openai-compatible",
        model: "qwen/qwen3.6-plus",
      },
    });

    const { default: registerCapabilityRouterExtension } = await import(
      "../../resources/extensions/glm-capability-router/index.ts"
    );

    const handlers = new Map<string, (...args: any[]) => any>();
    const notify = vi.fn();
    const setStatus = vi.fn();
    const targetModel = {
      provider: "openai-compatible",
      id: "qwen/qwen3.6-plus",
      input: ["text", "image"],
    };
    const setModel = vi.fn(async () => true);

    registerCapabilityRouterExtension({
      on: (event: string, handler: (...args: any[]) => any) => {
        handlers.set(event, handler);
      },
      setModel,
    } as unknown as ExtensionAPI);

    const input = handlers.get("input");
    expect(input).toBeTypeOf("function");

    const result = await input?.(
      {
        type: "input",
        text: "summarize the image",
        images: [{ type: "image", mimeType: "image/png", data: "abc" }],
        source: "interactive",
      },
      {
        hasUI: true,
        ui: { notify, setStatus },
        model: {
          provider: "glm",
          id: "glm-5.1",
          input: ["text"],
        },
        modelRegistry: {
          find: vi.fn(() => targetModel),
        },
      },
    );

    expect(result).toEqual({ action: "continue" });
    expect(setModel).toHaveBeenCalledWith(targetModel);
    expect(notify).toHaveBeenCalledWith(
      "Switched to vision fallback model openai-compatible/qwen/qwen3.6-plus for this request.",
      "info",
    );
    expect(setStatus).toHaveBeenCalledWith(
      "glm.routing",
      "vision fallback: route -> openai-compatible/qwen/qwen3.6-plus",
    );
  });

  test("blocks route mode when the configured fallback model is unavailable", async () => {
    readGlmModelRoutingConfigMock.mockReturnValue({
      visionFallback: {
        mode: "route",
        provider: "openai-compatible",
        model: "qwen/qwen3.6-plus",
      },
    });

    const { default: registerCapabilityRouterExtension } = await import(
      "../../resources/extensions/glm-capability-router/index.ts"
    );

    const handlers = new Map<string, (...args: any[]) => any>();
    const notify = vi.fn();
    const setModel = vi.fn(async () => true);
    registerCapabilityRouterExtension({
      on: (event: string, handler: (...args: any[]) => any) => {
        handlers.set(event, handler);
      },
      setModel,
    } as unknown as ExtensionAPI);

    const input = handlers.get("input");
    expect(input).toBeTypeOf("function");

    const result = await input?.(
      {
        type: "input",
        text: "summarize the image",
        images: [{ type: "image", mimeType: "image/png", data: "abc" }],
        source: "interactive",
      },
      {
        hasUI: true,
        ui: { notify, setStatus: vi.fn() },
        model: {
          provider: "glm",
          id: "glm-5.1",
          input: ["text"],
        },
        modelRegistry: {
          find: vi.fn(() => undefined),
        },
      },
    );

    expect(result).toEqual({ action: "continue" });
    expect(setModel).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      "Image input requires a configured vision fallback model, but openai-compatible/qwen/qwen3.6-plus is unavailable or does not support images.",
      "error",
    );
  });
});
