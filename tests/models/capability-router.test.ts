import { describe, expect, test } from "vitest";
import {
  collectRequestedModalities,
  resolveCapabilityRouteDecision,
} from "../../src/models/capability-router.js";

describe("capability router", () => {
  test("detects image input in the latest user message", () => {
    const requested = collectRequestedModalities([
      {
        role: "user",
        timestamp: Date.now(),
        content: [
          { type: "text", text: "analyze this" },
          { type: "image", data: "base64", mimeType: "image/png" },
        ],
      },
    ]);

    expect(requested).toEqual(["text", "image"]);
  });

  test("returns a route decision when the current model lacks image support and routing is enabled", () => {
    const decision = resolveCapabilityRouteDecision({
      requestedModalities: ["text", "image"],
      supportedModalities: ["text"],
      current: { provider: "glm", model: "glm-5.1" },
      visionFallback: {
        mode: "route",
        provider: "openai-compatible",
        model: "qwen/qwen3.5-122b-a10b",
      },
    });

    expect(decision).toEqual({
      action: "route",
      missingModalities: ["image"],
      target: {
        provider: "openai-compatible",
        model: "qwen/qwen3.5-122b-a10b",
      },
      reason: "current model does not support image input",
    });
  });

  test("returns a suggest decision by default when a fallback exists", () => {
    const decision = resolveCapabilityRouteDecision({
      requestedModalities: ["image"],
      supportedModalities: ["text"],
      current: { provider: "glm", model: "glm-5.1" },
      visionFallback: {
        mode: "suggest",
        provider: "openai-compatible",
        model: "qwen/qwen3.5-122b-a10b",
      },
    });

    expect(decision).toEqual({
      action: "suggest",
      missingModalities: ["image"],
      target: {
        provider: "openai-compatible",
        model: "qwen/qwen3.5-122b-a10b",
      },
      reason: "current model does not support image input",
    });
  });

  test("returns a blocked decision when routing is requested but no fallback is configured", () => {
    const decision = resolveCapabilityRouteDecision({
      requestedModalities: ["image"],
      supportedModalities: ["text"],
      current: { provider: "glm", model: "glm-5.1" },
      visionFallback: {
        mode: "route",
      },
    });

    expect(decision).toEqual({
      action: "blocked",
      missingModalities: ["image"],
      reason: "image input requires a configured vision fallback model",
    });
  });
});
