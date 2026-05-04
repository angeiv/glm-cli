import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { describe, expect, test, vi } from "vitest";
import registerGlmStats from "../../resources/extensions/glm-stats/index.js";

function createUsage() {
  return {
    input: 10,
    output: 5,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 15,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

describe("glm-stats extension", () => {
  test("registers /stats and /usage commands", () => {
    const commands: string[] = [];

    registerGlmStats({
      registerCommand: (name: string) => {
        commands.push(name);
      },
    } as unknown as ExtensionAPI);

    expect(commands).toContain("stats");
    expect(commands).toContain("usage");
  });

  test("hides redundant current branch stats when branch matches full session", async () => {
    const handlers = new Map<string, (args: string, ctx: any) => Promise<void>>();
    const setWidget = vi.fn();
    const notify = vi.fn();
    const entries = [
      {
        id: "assistant-1",
        type: "message",
        message: { role: "assistant", usage: createUsage() },
      },
    ];

    registerGlmStats({
      registerCommand: (
        name: string,
        command: { handler: (args: string, ctx: any) => Promise<void> },
      ) => {
        handlers.set(name, command.handler);
      },
    } as unknown as ExtensionAPI);

    await handlers.get("stats")?.("", {
      hasUI: true,
      ui: { setWidget, notify },
      sessionManager: {
        getEntries: () => entries,
        getLeafId: () => "assistant-1",
        getBranch: () => entries,
      },
      getContextUsage: () => null,
    });

    const [, lines] = setWidget.mock.calls[0];
    expect(lines).toContain("Session total: 1 assistant turn");
    expect(lines.some((line: string) => line.startsWith("Current branch:"))).toBe(false);
  });

  test("shows current branch stats when branch differs from full session", async () => {
    const handlers = new Map<string, (args: string, ctx: any) => Promise<void>>();
    const setWidget = vi.fn();
    const notify = vi.fn();
    const sessionEntries = [
      {
        id: "assistant-1",
        type: "message",
        message: { role: "assistant", usage: createUsage() },
      },
      {
        id: "assistant-2",
        type: "message",
        message: { role: "assistant", usage: createUsage() },
      },
    ];
    const branchEntries = [sessionEntries[0]];

    registerGlmStats({
      registerCommand: (
        name: string,
        command: { handler: (args: string, ctx: any) => Promise<void> },
      ) => {
        handlers.set(name, command.handler);
      },
    } as unknown as ExtensionAPI);

    await handlers.get("stats")?.("", {
      hasUI: true,
      ui: { setWidget, notify },
      sessionManager: {
        getEntries: () => sessionEntries,
        getLeafId: () => "assistant-1",
        getBranch: () => branchEntries,
      },
      getContextUsage: () => null,
    });

    const [, lines] = setWidget.mock.calls[0];
    expect(lines).toContain("Session total: 2 assistant turns");
    expect(lines).toContain("Current branch: 1 assistant turn");
  });

  test("renders context usage percent without multiplying an existing percentage again", async () => {
    const handlers = new Map<string, (args: string, ctx: any) => Promise<void>>();
    const setWidget = vi.fn();
    const notify = vi.fn();
    const entries = [
      {
        id: "assistant-1",
        type: "message",
        message: { role: "assistant", usage: createUsage() },
      },
    ];

    registerGlmStats({
      registerCommand: (
        name: string,
        command: { handler: (args: string, ctx: any) => Promise<void> },
      ) => {
        handlers.set(name, command.handler);
      },
    } as unknown as ExtensionAPI);

    await handlers.get("stats")?.("", {
      hasUI: true,
      ui: { setWidget, notify },
      sessionManager: {
        getEntries: () => entries,
        getLeafId: () => "assistant-1",
        getBranch: () => entries,
      },
      getContextUsage: () => ({
        tokens: 194_952,
        contextWindow: 128_000,
        percent: 152.31,
      }),
    });

    const [, lines] = setWidget.mock.calls[0];
    expect(lines).toContain("context: 194,952 / 128,000 (152%)");
  });
});
