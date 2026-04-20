import { afterEach, describe, expect, test, vi } from "vitest";
import { HookRunner } from "../../src/hooks/runner.js";
import { clearRuntimeEvents } from "../../src/diagnostics/event-log.js";
import { clearHookRuns } from "../../src/hooks/state.js";

afterEach(() => {
  clearRuntimeEvents();
  clearHookRuns();
});

describe("HookRunner", () => {
  test("matches a beforeTool rule and returns deny decision", async () => {
    const runner = new HookRunner({ enabled: true, hookTimeoutMs: 5000 });
    runner.setRules([
      {
        id: "deny-rm",
        event: "beforeTool",
        match: { tool: "bash", commandPrefix: "rm" },
        handler: { backend: "command", command: "echo deny: nope" },
      },
    ]);

    const exec = vi.fn(async () => ({
      stdout: "deny: nope\n",
      stderr: "",
      code: 0,
      killed: false,
    }));

    const result = await runner.run(
      { exec } as any,
      {
        name: "beforeTool",
        provider: "glm",
        model: "glm-5.1",
        tool: { name: "bash", input: { command: "rm -rf /tmp" } },
      },
    );

    expect(exec).toHaveBeenCalled();
    expect(result.decision).toMatchObject({ type: "deny", reason: "nope" });
  });

  test("skips rules that do not match", async () => {
    const runner = new HookRunner({ enabled: true, hookTimeoutMs: 5000 });
    runner.setRules([
      {
        id: "deny-rm",
        event: "beforeTool",
        match: { tool: "bash", commandPrefix: "rm" },
        handler: { backend: "command", command: "echo deny: nope" },
      },
    ]);

    const exec = vi.fn(async () => ({
      stdout: "deny: nope\n",
      stderr: "",
      code: 0,
      killed: false,
    }));

    const result = await runner.run(
      { exec } as any,
      {
        name: "beforeTool",
        provider: "glm",
        model: "glm-5.1",
        tool: { name: "read", input: { path: "/tmp" } },
      },
    );

    expect(exec).not.toHaveBeenCalled();
    expect(result.decision).toEqual({ type: "allow" });
  });
});

