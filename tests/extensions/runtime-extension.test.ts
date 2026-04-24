import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, test, vi } from "vitest";
import registerRuntimeExtension from "../../resources/extensions/glm-runtime/index.js";
import { appendRuntimeEvent, clearRuntimeEvents } from "../../src/diagnostics/event-log.js";
import { clearRuntimeStatus, setRuntimeStatus } from "../../src/diagnostics/runtime-status.js";

afterEach(() => {
  clearRuntimeEvents();
  clearRuntimeStatus();
});

describe("glm-runtime extension", () => {
  test("registers /inspect and /events commands", () => {
    const commands: string[] = [];

    registerRuntimeExtension({
      registerCommand: (name: string) => {
        commands.push(name);
      },
    } as unknown as ExtensionAPI);

    expect(commands).toContain("inspect");
    expect(commands).toContain("events");
  });

  test("/inspect renders the current runtime snapshot", async () => {
    let inspectHandler:
      | ((args: string, ctx: any) => Promise<void>)
      | undefined;
    const setWidget = vi.fn();
    const notify = vi.fn();

    registerRuntimeExtension({
      registerCommand: (name: string, options: { handler: (args: string, ctx: any) => Promise<void> }) => {
        if (name === "inspect") {
          inspectHandler = options.handler;
        }
      },
    } as unknown as ExtensionAPI);

    setRuntimeStatus({
      cwd: "/tmp/repo",
      provider: "glm",
      model: "glm-5.1",
      approvalPolicy: "ask",
      loop: {
        enabled: false,
        profile: "code",
        maxRounds: 3,
        failureMode: "handoff",
        autoVerify: true,
      },
      diagnostics: {
        debugRuntime: false,
        eventLogLimit: 200,
        eventCount: 0,
      },
      notifications: {
        enabled: true,
        onTurnEnd: true,
        onLoopResult: true,
      },
      mcp: {
        enabled: true,
        configPath: "/tmp/.glm/mcp.json",
        cachePath: "/tmp/.glm/agent/mcp-cache.json",
        configuredServerCount: 1,
        modeCounts: {
          direct: 0,
          proxy: 1,
          hybrid: 0,
        },
      },
      verification: {
        latest: {
          artifactPath: "/tmp/.glm/sessions/repo/artifacts/verify-1.json",
          createdAt: "2026-04-24T00:00:00.000Z",
          scenario: "smoke",
          kind: "pass",
          command: "pnpm test",
          exitCode: 0,
          summary: "Verification passed.",
        },
      },
      paths: {
        agentDir: "/tmp/.glm/agent",
        sessionDir: "/tmp/.glm/sessions/repo",
        authPath: "/tmp/.glm/agent/auth.json",
        modelsPath: "/tmp/.glm/agent/models.json",
      },
    });

    await inspectHandler?.("", {
      hasUI: true,
      ui: { setWidget, notify },
    });

    expect(setWidget).toHaveBeenCalledWith(
      "glm.runtime",
      expect.arrayContaining([
        "Provider: glm",
        "Model: glm-5.1",
        "Notifications: on | turnEnd on | loopResult on",
        "MCP: enabled | servers 1 | direct 0 | proxy 1 | hybrid 0",
        "Verification: smoke | pass | pnpm test | Verification passed. | /tmp/.glm/sessions/repo/artifacts/verify-1.json",
      ]),
      expect.any(Object),
    );
    expect(notify).toHaveBeenCalled();
  });

  test("/events shows recent events and clears them on request", async () => {
    let eventsHandler:
      | ((args: string, ctx: any) => Promise<void>)
      | undefined;
    const setWidget = vi.fn();
    const notify = vi.fn();

    registerRuntimeExtension({
      registerCommand: (name: string, options: { handler: (args: string, ctx: any) => Promise<void> }) => {
        if (name === "events") {
          eventsHandler = options.handler;
        }
      },
    } as unknown as ExtensionAPI);

    appendRuntimeEvent({ type: "approval.changed", summary: "approvalPolicy set to auto" });
    appendRuntimeEvent({ type: "loop.verify", summary: "verification failed" });

    await eventsHandler?.("", {
      hasUI: true,
      ui: { setWidget, notify },
    });

    expect(setWidget).toHaveBeenCalledWith(
      "glm.events",
      expect.arrayContaining([
        expect.stringContaining("approval.changed"),
        expect.stringContaining("loop.verify"),
      ]),
      expect.any(Object),
    );

    await eventsHandler?.("clear", {
      hasUI: true,
      ui: { setWidget, notify },
    });

    expect(setWidget).toHaveBeenLastCalledWith("glm.events", undefined);
  });
});
