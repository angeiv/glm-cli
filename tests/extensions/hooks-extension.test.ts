import { afterEach, describe, expect, test, vi } from "vitest";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { HookRunner } from "../../src/hooks/runner.js";
import { clearHookRuns } from "../../src/hooks/state.js";
import { clearRuntimeEvents } from "../../src/diagnostics/event-log.js";

afterEach(() => {
  clearHookRuns();
  clearRuntimeEvents();
  const store = globalThis as Record<PropertyKey, unknown>;
  delete store[Symbol.for("glm.hookRunner")];
});

describe("glm-hooks extension", () => {
  test("registers /hooks", async () => {
    const { default: registerHooksExtension } = await import(
      "../../resources/extensions/glm-hooks/index.ts"
    );

    const commands: string[] = [];

    registerHooksExtension({
      on: vi.fn(),
      registerCommand: (name: string) => {
        commands.push(name);
      },
    } as unknown as ExtensionAPI);

    expect(commands).toContain("hooks");
  });

  test("blocks tool calls when hook runner returns deny", async () => {
    const runner = new HookRunner({ enabled: true, hookTimeoutMs: 5000 });
    runner.setRules([
      {
        id: "deny-rm",
        event: "beforeTool",
        match: { tool: "bash", commandPrefix: "rm" },
        handler: { backend: "command", command: "echo deny: nope" },
      },
    ]);

    const store = globalThis as Record<PropertyKey, unknown>;
    store[Symbol.for("glm.hookRunner")] = runner;

    const { default: registerHooksExtension } = await import(
      "../../resources/extensions/glm-hooks/index.ts"
    );

    const handlers = new Map<string, any>();

    const exec = vi.fn(async () => ({
      stdout: "deny: nope\n",
      stderr: "",
      code: 0,
      killed: false,
    }));

    registerHooksExtension({
      exec,
      on: (event: string, handler: any) => {
        handlers.set(event, handler);
      },
      registerCommand: vi.fn(),
      sendMessage: vi.fn(),
    } as unknown as ExtensionAPI);

    const toolCall = handlers.get("tool_call");
    expect(toolCall).toBeTypeOf("function");

    const result = await toolCall(
      { toolName: "bash", input: { command: "rm -rf /tmp" } },
      {
        model: { provider: "glm", id: "glm-5.1" },
        signal: undefined,
      },
    );

    expect(exec).toHaveBeenCalled();
    expect(result).toMatchObject({ block: true, reason: "nope" });
  });
});
