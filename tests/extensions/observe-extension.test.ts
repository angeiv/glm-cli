import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { describe, expect, test, vi } from "vitest";
import { clearRuntimeEvents, getRuntimeEvents } from "../../src/diagnostics/event-log.js";
import { setRuntimeStatus } from "../../src/diagnostics/runtime-status.js";

function setDebugRuntime(debugRuntime: boolean): void {
  setRuntimeStatus({
    cwd: "/tmp/repo",
    provider: "glm",
    model: "glm-5.1",
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4/",
    resolvedModel: {
      canonicalModelId: "glm-5.1",
      platform: "native-bigmodel",
      upstreamVendor: "unknown",
      payloadPatchPolicy: "glm-native",
      confidence: "high",
      contextWindow: 204_800,
      maxOutputTokens: 131_072,
      supportsThinking: true,
      supportsPreservedThinking: true,
      supportsStreaming: true,
      supportsToolCall: true,
      supportsToolStream: true,
      supportsCache: true,
      supportsStructuredOutput: true,
      supportsMcp: true,
    },
    modelDiscovery: {
      enabled: true,
      supported: true,
      cachePath: "/tmp/.glm/agent/discovered-models.json",
      cacheKey: "glm::openai-compatible::https://open.bigmodel.cn/api/coding/paas/v4",
      source: "miss",
    },
    generation: {},
    glmCapabilities: {},
    toolSignature: {
      hash: "0".repeat(64),
      builtinTools: [],
      customTools: [],
      mcp: { configPath: "" },
    },
    approvalPolicy: "ask",
    loop: {
      enabled: false,
      profile: "code",
      maxRounds: 3,
      failureMode: "handoff",
      autoVerify: true,
    },
    compaction: {
      enabled: true,
      reserveTokens: 16_384,
      keepRecentTokens: 20_000,
      settingsPaths: {
        global: "/tmp/.glm/agent/settings.json",
        project: "/tmp/repo/.glm/settings.json",
      },
      sources: {
        enabled: "default",
        reserveTokens: "default",
        keepRecentTokens: "default",
      },
    },
    diagnostics: {
      debugRuntime,
      eventLogLimit: 200,
      eventCount: 0,
    },
    notifications: {
      enabled: false,
      onTurnEnd: false,
      onLoopResult: false,
    },
    mcp: {
      enabled: false,
      configPath: "/tmp/repo/mcp.json",
      cachePath: "/tmp/repo/mcp-cache.json",
      configuredServerCount: 0,
      modeCounts: { direct: 0, proxy: 0, hybrid: 0 },
    },
    verification: {},
    paths: {
      agentDir: "/tmp/.glm/agent",
      sessionDir: "/tmp/.glm/sessions/repo",
      authPath: "/tmp/.glm/agent/auth.json",
      modelsPath: "/tmp/.glm/agent/models.json",
    },
  } as any);
}

describe("glm-zz-observe extension", () => {
  test("does not emit provider.request when debugRuntime is disabled", async () => {
    const { default: registerObserveExtension } = await import(
      "../../resources/extensions/glm-zz-observe/index.ts"
    );

    clearRuntimeEvents();
    setDebugRuntime(false);
    clearRuntimeEvents();

    const handlers = new Map<string, (...args: any[]) => any>();
    registerObserveExtension({
      on: (event: string, handler: (...args: any[]) => any) => {
        handlers.set(event, handler);
      },
    } as unknown as ExtensionAPI);

    const beforeProviderRequest = handlers.get("before_provider_request");
    expect(beforeProviderRequest).toBeTypeOf("function");

    await beforeProviderRequest?.(
      { type: "before_provider_request", payload: { stream: true, max_tokens: 16 } },
      {
        model: {
          provider: "glm",
          id: "glm-5.1",
          api: "openai-completions",
          baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4/",
          compat: { thinkingFormat: "zai" },
        },
      },
    );

    expect(getRuntimeEvents().some((event) => event.type === "provider.request")).toBe(false);
  });

  test("emits provider.request when debugRuntime is enabled", async () => {
    const { default: registerObserveExtension } = await import(
      "../../resources/extensions/glm-zz-observe/index.ts"
    );

    clearRuntimeEvents();
    setDebugRuntime(true);
    clearRuntimeEvents();

    const handlers = new Map<string, (...args: any[]) => any>();
    registerObserveExtension({
      on: (event: string, handler: (...args: any[]) => any) => {
        handlers.set(event, handler);
      },
    } as unknown as ExtensionAPI);

    const beforeProviderRequest = handlers.get("before_provider_request");
    expect(beforeProviderRequest).toBeTypeOf("function");

    await beforeProviderRequest?.(
      {
        type: "before_provider_request",
        payload: {
          stream: true,
          tools: [{ type: "function", function: { name: "demo", parameters: {} } }],
          tool_stream: true,
          thinking: { type: "enabled", clear_thinking: true },
          thinking_budget: "31999",
          reasoning_effort: "xhigh",
          response_format: { type: "json_object" },
          max_tokens: 16,
          max_completion_tokens: "32000",
          temperature: 0.1,
        },
      },
      {
        model: {
          provider: "glm",
          id: "glm-5.1",
          api: "openai-completions",
          baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4/",
          compat: { thinkingFormat: "zai" },
        },
      },
    );

    const events = getRuntimeEvents().filter((event) => event.type === "provider.request");
    expect(events.length).toBe(1);
    expect(events[0].summary).toContain("glm/glm-5.1");
    expect(events[0].summary).toContain("tool_stream=on");
    expect(events[0].summary).toContain("thinking=enabled");
    expect(events[0].summary).toContain("thinking_budget=31999");
    expect(events[0].summary).toContain("max_completion_tokens=32000");
    expect((events[0].details as any).request).toMatchObject({
      thinking_budget: 31999,
      reasoning_effort: "xhigh",
      max_completion_tokens: 32000,
    });
  });

  test("updates the thinking status bar and records thinking level changes", async () => {
    const { default: registerObserveExtension } = await import(
      "../../resources/extensions/glm-zz-observe/index.ts"
    );

    clearRuntimeEvents();
    setDebugRuntime(false);
    clearRuntimeEvents();

    const handlers = new Map<string, (...args: any[]) => any>();
    const setStatus = vi.fn();
    registerObserveExtension({
      on: (event: string, handler: (...args: any[]) => any) => {
        handlers.set(event, handler);
      },
    } as unknown as ExtensionAPI);

    const thinkingLevelSelect = handlers.get("thinking_level_select");
    expect(thinkingLevelSelect).toBeTypeOf("function");

    await thinkingLevelSelect?.(
      { type: "thinking_level_select", level: "high", previousLevel: "minimal" },
      {
        hasUI: true,
        ui: { setStatus },
        model: {
          provider: "glm",
          id: "glm-5.1",
          reasoning: true,
          thinkingLevelMap: {
            minimal: null,
            low: null,
            medium: null,
          },
        },
      },
    );

    expect(setStatus).toHaveBeenCalledWith("glm.thinking", "thinking: high [off/high]");
    expect(getRuntimeEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "thinking.level",
          summary: "thinking level changed: minimal -> high [off/high]",
        }),
      ]),
    );
  });

  test("captures provider response metadata and replaces the finalized assistant message", async () => {
    const { default: registerObserveExtension } = await import(
      "../../resources/extensions/glm-zz-observe/index.ts"
    );

    clearRuntimeEvents();
    setDebugRuntime(true);
    clearRuntimeEvents();

    const handlers = new Map<string, (...args: any[]) => any>();
    registerObserveExtension({
      on: (event: string, handler: (...args: any[]) => any) => {
        handlers.set(event, handler);
      },
    } as unknown as ExtensionAPI);

    const afterProviderResponse = handlers.get("after_provider_response");
    const messageEnd = handlers.get("message_end");
    expect(afterProviderResponse).toBeTypeOf("function");
    expect(messageEnd).toBeTypeOf("function");

    await afterProviderResponse?.(
      {
        type: "after_provider_response",
        status: 200,
        headers: new Headers({
          "x-request-id": "req_123",
          "x-cache": "HIT",
          "x-routed-model": "glm-5.1-20260501",
        }),
      },
      {},
    );

    const result = await messageEnd?.(
      {
        type: "message_end",
        message: {
          role: "assistant",
          provider: "glm",
          model: "glm-5.1",
          stopReason: "stop",
          usage: {
            input: 12,
            output: 34,
            cacheRead: 56,
            cacheWrite: 0,
            totalTokens: 102,
          },
          content: [{ type: "text", text: "done" }],
        },
      },
      {},
    );

    expect(result?.message).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "done" }],
      glmMeta: {
        providerResponse: {
          status: 200,
          requestId: "req_123",
          cacheStatus: "HIT",
          routedModel: "glm-5.1-20260501",
        },
      },
    });
    expect(getRuntimeEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "provider.response",
        }),
      ]),
    );
  });
});
