import { describe, expect, test, vi } from "vitest";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type SessionEntry = {
  type: string;
  customType?: string;
  data?: unknown;
};

describe("glm-loop extension", () => {
  test("registers /loop and persists session settings", async () => {
    const { default: registerLoopExtension } = await import(
      "../../resources/extensions/glm-loop/index.js"
    );

    let handler:
      | ((args: string, ctx: any) => Promise<void>)
      | undefined;
    const entries: SessionEntry[] = [];
    const messages: string[] = [];

    registerLoopExtension({
      on: vi.fn(),
      registerCommand: (
        name: string,
        options: {
          handler: (args: string, ctx: any) => Promise<void>;
        },
      ) => {
        if (name === "loop") {
          handler = options.handler;
        }
      },
      appendEntry: (customType: string, data: unknown) => {
        entries.push({ type: "custom", customType, data });
      },
      sendMessage: (message: { content: string }) => {
        messages.push(message.content);
      },
    } as unknown as ExtensionAPI);

    expect(handler).toBeTypeOf("function");

    const ctx = {
      cwd: process.cwd(),
      sessionManager: {
        getEntries: () => entries,
        getSessionId: () => "session-run",
      },
      isIdle: () => true,
      waitForIdle: vi.fn(async () => undefined),
      ui: {
        notify: vi.fn(),
      },
    };

    await handler?.("on", ctx);
    await handler?.("verify pnpm test", ctx);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      customType: "glm.loop.state",
      data: expect.objectContaining({ enabled: true }),
    });
    expect(entries[1]).toMatchObject({
      customType: "glm.loop.state",
      data: expect.objectContaining({ verifyCommand: "pnpm test" }),
    });
    expect(messages[messages.length - 1]).toContain("Verifier: pnpm test");
  });

  test("runs one repair round and then succeeds", async () => {
    const { default: registerLoopExtension } = await import(
      "../../resources/extensions/glm-loop/index.js"
    );

    let handler:
      | ((args: string, ctx: any) => Promise<void>)
      | undefined;
    const entries: SessionEntry[] = [];
    const userMessages: string[] = [];
    const customMessages: string[] = [];
    const exec = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "",
        stderr: "first verification failed\n",
        code: 1,
        killed: false,
      })
      .mockResolvedValueOnce({
        stdout: "all tests passed\n",
        stderr: "",
        code: 0,
        killed: false,
      });

    registerLoopExtension({
      on: vi.fn(),
      registerCommand: (
        name: string,
        options: {
          handler: (args: string, ctx: any) => Promise<void>;
        },
      ) => {
        if (name === "loop") {
          handler = options.handler;
        }
      },
      appendEntry: (customType: string, data: unknown) => {
        entries.push({ type: "custom", customType, data });
      },
      sendMessage: (message: { content: string }) => {
        customMessages.push(message.content);
      },
      sendUserMessage: (content: string) => {
        userMessages.push(content);
      },
      exec,
    } as unknown as ExtensionAPI);

    expect(handler).toBeTypeOf("function");

    const ctx = {
      cwd: process.cwd(),
      sessionManager: {
        getEntries: () => entries,
        getSessionId: () => "session-run",
      },
      isIdle: () => true,
      waitForIdle: vi.fn(async () => undefined),
      ui: {
        notify: vi.fn(),
      },
    };

    entries.push({
      type: "custom",
      customType: "glm.loop.state",
      data: {
        enabled: true,
        profile: "code",
        maxRounds: 2,
        failureMode: "handoff",
        autoVerify: true,
        verifyCommand: "pnpm test",
      },
    });

    await handler?.("run fix tests", ctx);

    expect(userMessages).toHaveLength(2);
    expect(userMessages[0]).toContain("explicit delivery-quality loop");
    expect(userMessages[1]).toContain("first verification failed");
    expect(exec).toHaveBeenCalledTimes(2);
    expect(customMessages[customMessages.length - 1]).toContain(
      "Loop succeeded after 2 rounds.",
    );
  });

  test("manual loop updates the status bar with run, verify, repair, and done phases", async () => {
    const { default: registerLoopExtension } = await import(
      "../../resources/extensions/glm-loop/index.js"
    );

    let handler:
      | ((args: string, ctx: any) => Promise<void>)
      | undefined;
    const entries: SessionEntry[] = [];
    const exec = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "",
        stderr: "first verification failed\n",
        code: 1,
        killed: false,
      })
      .mockResolvedValueOnce({
        stdout: "all tests passed\n",
        stderr: "",
        code: 0,
        killed: false,
      });
    const setStatus = vi.fn();

    registerLoopExtension({
      on: vi.fn(),
      registerCommand: (
        name: string,
        options: {
          handler: (args: string, ctx: any) => Promise<void>;
        },
      ) => {
        if (name === "loop") {
          handler = options.handler;
        }
      },
      appendEntry: (customType: string, data: unknown) => {
        entries.push({ type: "custom", customType, data });
      },
      sendMessage: vi.fn(),
      sendUserMessage: vi.fn(),
      exec,
    } as unknown as ExtensionAPI);

    const ctx = {
      cwd: process.cwd(),
      sessionManager: {
        getEntries: () => entries,
        getSessionId: () => "session-manual-status",
      },
      isIdle: () => true,
      waitForIdle: vi.fn(async () => undefined),
      ui: {
        notify: vi.fn(),
        setStatus,
      },
    };

    entries.push({
      type: "custom",
      customType: "glm.loop.state",
      data: {
        enabled: true,
        profile: "code",
        maxRounds: 2,
        failureMode: "handoff",
        autoVerify: true,
        verifyCommand: "pnpm test",
      },
    });

    await handler?.("run fix tests", ctx);

    const updates = setStatus.mock.calls.map((call) => call[1]);
    expect(updates).toContain("loop manual run r1/2");
    expect(updates).toContain("loop manual verify r1/2");
    expect(updates).toContain("loop manual repair r2/2");
    expect(updates).toContain("loop manual verify r2/2");
    expect(updates).toContain("loop done");
  });

  test("auto loop verifies armed chat turns and sends a repair prompt on failure", async () => {
    const { default: registerLoopExtension } = await import(
      "../../resources/extensions/glm-loop/index.js"
    );

    const commands = new Map<string, (args: string, ctx: any) => Promise<void>>();
    const events = new Map<string, (event: any, ctx: any) => Promise<void>>();
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "glm.loop.state",
        data: {
          enabled: true,
          profile: "code",
          maxRounds: 2,
          failureMode: "handoff",
          autoVerify: true,
          verifyCommand: "pnpm test",
        },
      },
    ];
    const userMessages: string[] = [];
    const customMessages: string[] = [];
    const exec = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "",
        stderr: "first verification failed\n",
        code: 1,
        killed: false,
      })
      .mockResolvedValueOnce({
        stdout: "all tests passed\n",
        stderr: "",
        code: 0,
        killed: false,
      });

    registerLoopExtension({
      registerCommand: (name: string, options: { handler: (args: string, ctx: any) => Promise<void> }) => {
        commands.set(name, options.handler);
      },
      on: (event: string, handler: (event: any, ctx: any) => Promise<void>) => {
        events.set(event, handler);
      },
      sendMessage: (message: { content: string }) => {
        customMessages.push(message.content);
      },
      sendUserMessage: (content: string) => {
        userMessages.push(content);
      },
      appendEntry: vi.fn(),
      exec,
    } as unknown as ExtensionAPI);

    expect(commands.get("loop")).toBeTypeOf("function");
    expect(events.get("before_agent_start")).toBeTypeOf("function");
    expect(events.get("agent_end")).toBeTypeOf("function");

    const ctx = {
      cwd: process.cwd(),
      sessionManager: {
        getEntries: () => entries,
        getSessionId: () => "session-1",
      },
      isIdle: () => true,
      ui: {
        notify: vi.fn(),
      },
    };

    await events.get("before_agent_start")?.({ prompt: "fix tests" }, ctx);
    await events.get("agent_end")?.({ messages: [] }, ctx);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0]).toContain("Verification failed. Begin repair round 2.");

    await events.get("agent_end")?.({ messages: [] }, ctx);

    expect(exec).toHaveBeenCalledTimes(2);
    expect(customMessages[customMessages.length - 1]).toContain(
      "Loop succeeded after 2 rounds.",
    );
  });

  test("auto loop updates the status bar with run, verify, repair, and done phases", async () => {
    const { default: registerLoopExtension } = await import(
      "../../resources/extensions/glm-loop/index.js"
    );

    const events = new Map<string, (event: any, ctx: any) => Promise<void>>();
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "glm.loop.state",
        data: {
          enabled: true,
          profile: "code",
          maxRounds: 2,
          failureMode: "handoff",
          autoVerify: true,
          verifyCommand: "pnpm test",
        },
      },
    ];
    const exec = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "",
        stderr: "first verification failed\n",
        code: 1,
        killed: false,
      })
      .mockResolvedValueOnce({
        stdout: "all tests passed\n",
        stderr: "",
        code: 0,
        killed: false,
      });
    const setStatus = vi.fn();

    registerLoopExtension({
      registerCommand: vi.fn(),
      on: (event: string, handler: (event: any, ctx: any) => Promise<void>) => {
        events.set(event, handler);
      },
      sendMessage: vi.fn(),
      sendUserMessage: vi.fn(),
      appendEntry: vi.fn(),
      exec,
    } as unknown as ExtensionAPI);

    const ctx = {
      cwd: process.cwd(),
      sessionManager: {
        getEntries: () => entries,
        getSessionId: () => "session-auto-status",
      },
      isIdle: () => true,
      ui: {
        notify: vi.fn(),
        setStatus,
      },
    };

    await events.get("before_agent_start")?.({ prompt: "fix tests" }, ctx);
    await events.get("agent_end")?.({ messages: [] }, ctx);
    await events.get("before_agent_start")?.({ prompt: "repair round 2" }, ctx);
    await events.get("agent_end")?.({ messages: [] }, ctx);

    const updates = setStatus.mock.calls.map((call) => call[1]);
    expect(updates).toContain("loop auto run r1/2");
    expect(updates).toContain("loop auto verify r1/2");
    expect(updates).toContain("loop auto repair r2/2");
    expect(updates).toContain("loop auto run r2/2");
    expect(updates).toContain("loop auto verify r2/2");
    expect(updates).toContain("loop done");
  });

  test("auto loop stays quiet when verification passes on the first round", async () => {
    const { default: registerLoopExtension } = await import(
      "../../resources/extensions/glm-loop/index.js"
    );

    const events = new Map<string, (event: any, ctx: any) => Promise<void>>();
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "glm.loop.state",
        data: {
          enabled: true,
          profile: "code",
          maxRounds: 2,
          failureMode: "handoff",
          autoVerify: true,
          verifyCommand: "pnpm test",
        },
      },
    ];
    const userMessages: string[] = [];
    const customMessages: string[] = [];
    const exec = vi.fn().mockResolvedValue({
      stdout: "all tests passed\n",
      stderr: "",
      code: 0,
      killed: false,
    });

    registerLoopExtension({
      registerCommand: vi.fn(),
      on: (event: string, handler: (event: any, ctx: any) => Promise<void>) => {
        events.set(event, handler);
      },
      sendMessage: (message: { content: string }) => {
        customMessages.push(message.content);
      },
      sendUserMessage: (content: string) => {
        userMessages.push(content);
      },
      appendEntry: vi.fn(),
      exec,
    } as unknown as ExtensionAPI);

    const ctx = {
      cwd: process.cwd(),
      sessionManager: {
        getEntries: () => entries,
        getSessionId: () => "session-quiet-success",
      },
      isIdle: () => true,
      ui: {
        notify: vi.fn(),
      },
    };

    await events.get("before_agent_start")?.({ prompt: "fix tests" }, ctx);
    await events.get("agent_end")?.({ messages: [] }, ctx);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(userMessages).toHaveLength(0);
    expect(customMessages).toHaveLength(0);
  });

  test("auto loop persists the last successful verification result for /loop status", async () => {
    const { default: registerLoopExtension } = await import(
      "../../resources/extensions/glm-loop/index.js"
    );

    const commands = new Map<string, (args: string, ctx: any) => Promise<void>>();
    const events = new Map<string, (event: any, ctx: any) => Promise<void>>();
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "glm.loop.state",
        data: {
          enabled: true,
          profile: "code",
          maxRounds: 2,
          failureMode: "handoff",
          autoVerify: true,
          verifyCommand: "pnpm test",
        },
      },
    ];
    const messages: string[] = [];
    const exec = vi.fn().mockResolvedValue({
      stdout: "all tests passed\n",
      stderr: "",
      code: 0,
      killed: false,
    });

    registerLoopExtension({
      registerCommand: (name: string, options: { handler: (args: string, ctx: any) => Promise<void> }) => {
        commands.set(name, options.handler);
      },
      on: (event: string, handler: (event: any, ctx: any) => Promise<void>) => {
        events.set(event, handler);
      },
      sendMessage: (message: { content: string }) => {
        messages.push(message.content);
      },
      sendUserMessage: vi.fn(),
      appendEntry: (customType: string, data: unknown) => {
        entries.push({ type: "custom", customType, data });
      },
      exec,
    } as unknown as ExtensionAPI);

    const ctx = {
      cwd: process.cwd(),
      sessionManager: {
        getEntries: () => entries,
        getSessionId: () => "session-last-success",
      },
      isIdle: () => true,
      waitForIdle: vi.fn(async () => undefined),
      ui: {
        notify: vi.fn(),
      },
    };

    await events.get("before_agent_start")?.({ prompt: "fix tests" }, ctx);
    await events.get("agent_end")?.({ messages: [] }, ctx);
    await commands.get("loop")?.("status", ctx);

    expect(entries[entries.length - 1]).toMatchObject({
      customType: "glm.loop.result",
      data: expect.objectContaining({
        status: "succeeded",
        verification: expect.objectContaining({
          kind: "pass",
          command: "pnpm test",
          exitCode: 0,
          summary: "all tests passed",
          stdoutSummary: "all tests passed",
        }),
      }),
    });
    expect(messages[messages.length - 1]).toContain("Last status: succeeded");
    expect(messages[messages.length - 1]).toContain("Last verifier: pnpm test");
    expect(messages[messages.length - 1]).toContain("Last summary: all tests passed");
    expect(messages[messages.length - 1]).toContain("Last verification: pass");
    expect(messages[messages.length - 1]).toContain("Last stdout summary: all tests passed");
  });

  test("/loop status includes active auto loop progress", async () => {
    const { default: registerLoopExtension } = await import(
      "../../resources/extensions/glm-loop/index.js"
    );

    const commands = new Map<string, (args: string, ctx: any) => Promise<void>>();
    const events = new Map<string, (event: any, ctx: any) => Promise<void>>();
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "glm.loop.state",
        data: {
          enabled: true,
          profile: "code",
          maxRounds: 3,
          failureMode: "handoff",
          autoVerify: true,
          verifyCommand: "pnpm test",
        },
      },
    ];
    const messages: string[] = [];

    registerLoopExtension({
      registerCommand: (name: string, options: { handler: (args: string, ctx: any) => Promise<void> }) => {
        commands.set(name, options.handler);
      },
      on: (event: string, handler: (event: any, ctx: any) => Promise<void>) => {
        events.set(event, handler);
      },
      sendMessage: (message: { content: string }) => {
        messages.push(message.content);
      },
      sendUserMessage: vi.fn(),
      appendEntry: vi.fn(),
      exec: vi.fn(),
    } as unknown as ExtensionAPI);

    const ctx = {
      cwd: process.cwd(),
      sessionManager: {
        getEntries: () => entries,
        getSessionId: () => "session-status",
      },
      isIdle: () => true,
      waitForIdle: vi.fn(async () => undefined),
      ui: {
        notify: vi.fn(),
      },
    };

    await events.get("before_agent_start")?.({ prompt: "fix tests" }, ctx);
    await commands.get("loop")?.("status", ctx);

    expect(messages[messages.length - 1]).toContain("Active loop: auto");
    expect(messages[messages.length - 1]).toContain("Current round: 1 / 3");
    expect(messages[messages.length - 1]).toContain("Verifier source: session");
  });

  test("/loop status includes the last handoff summary after a failed manual loop", async () => {
    const { default: registerLoopExtension } = await import(
      "../../resources/extensions/glm-loop/index.js"
    );

    const commands = new Map<string, (args: string, ctx: any) => Promise<void>>();
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "glm.loop.state",
        data: {
          enabled: true,
          profile: "code",
          maxRounds: 1,
          failureMode: "handoff",
          autoVerify: true,
          verifyCommand: "pnpm test",
        },
      },
    ];
    const messages: string[] = [];
    const exec = vi.fn().mockResolvedValue({
      stdout: "",
      stderr: "still failing\n",
      code: 1,
      killed: false,
    });

    registerLoopExtension({
      registerCommand: (name: string, options: { handler: (args: string, ctx: any) => Promise<void> }) => {
        commands.set(name, options.handler);
      },
      on: vi.fn(),
      sendMessage: (message: { content: string }) => {
        messages.push(message.content);
      },
      sendUserMessage: vi.fn(),
      appendEntry: (customType: string, data: unknown) => {
        entries.push({ type: "custom", customType, data });
      },
      exec,
    } as unknown as ExtensionAPI);

    const ctx = {
      cwd: process.cwd(),
      sessionManager: {
        getEntries: () => entries,
        getSessionId: () => "session-last-handoff",
      },
      isIdle: () => true,
      waitForIdle: vi.fn(async () => undefined),
      ui: {
        notify: vi.fn(),
      },
    };

    await commands.get("loop")?.("run fix tests", ctx);
    await commands.get("loop")?.("status", ctx);

    expect(entries[entries.length - 1]).toMatchObject({
      customType: "glm.loop.result",
      data: expect.objectContaining({
        status: "handoff",
        verification: expect.objectContaining({
          kind: "fail",
          command: "pnpm test",
          exitCode: 1,
          summary: "still failing",
          stderrSummary: "still failing",
        }),
      }),
    });
    expect(messages[messages.length - 1]).toContain("Last status: handoff");
    expect(messages[messages.length - 1]).toContain("Last summary: still failing");
    expect(messages[messages.length - 1]).toContain("Last stderr summary: still failing");
  });

  test("/loop history shows recent loop results in reverse chronological order", async () => {
    const { default: registerLoopExtension } = await import(
      "../../resources/extensions/glm-loop/index.js"
    );

    const commands = new Map<string, (args: string, ctx: any) => Promise<void>>();
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "glm.loop.state",
        data: {
          enabled: true,
          profile: "code",
          maxRounds: 3,
          failureMode: "handoff",
          autoVerify: true,
          verifyCommand: "pnpm test",
        },
      },
      {
        type: "custom",
        customType: "glm.loop.result",
        data: {
          status: "handoff",
          task: "fix lint",
          rounds: 3,
          verifier: "pnpm test",
          summary: "lint still failing",
          outcome: "Loop stopped and requires human handoff.",
          completedAt: "2026-04-16T00:00:01.000Z",
        },
      },
      {
        type: "custom",
        customType: "glm.loop.result",
        data: {
          status: "succeeded",
          task: "fix tests",
          rounds: 2,
          verifier: "pnpm test",
          summary: "all tests passed",
          outcome: "Loop succeeded after 2 rounds.",
          completedAt: "2026-04-16T00:00:02.000Z",
        },
      },
      {
        type: "custom",
        customType: "glm.loop.result",
        data: {
          status: "failed",
          task: "fix build",
          rounds: 1,
          verifier: "pnpm test",
          summary: "build script crashed",
          outcome: "Loop stopped with failure.",
          completedAt: "2026-04-16T00:00:03.000Z",
        },
      },
    ];
    const messages: string[] = [];

    registerLoopExtension({
      registerCommand: (name: string, options: { handler: (args: string, ctx: any) => Promise<void> }) => {
        commands.set(name, options.handler);
      },
      on: vi.fn(),
      sendMessage: (message: { content: string }) => {
        messages.push(message.content);
      },
      sendUserMessage: vi.fn(),
      appendEntry: vi.fn(),
      exec: vi.fn(),
    } as unknown as ExtensionAPI);

    const ctx = {
      cwd: process.cwd(),
      sessionManager: {
        getEntries: () => entries,
        getSessionId: () => "session-history",
      },
      isIdle: () => true,
      waitForIdle: vi.fn(async () => undefined),
      ui: {
        notify: vi.fn(),
      },
    };

    await commands.get("loop")?.("history 2", ctx);

    expect(messages[messages.length - 1]).toContain("Recent loop results: 2");
    expect(messages[messages.length - 1]).toContain("1. failed | fix build | rounds 1");
    expect(messages[messages.length - 1]).toContain("2. succeeded | fix tests | rounds 2");
    expect(messages[messages.length - 1]).not.toContain("fix lint");
  });

  test("/loop show displays one result entry by reverse chronological index", async () => {
    const { default: registerLoopExtension } = await import(
      "../../resources/extensions/glm-loop/index.js"
    );

    const commands = new Map<string, (args: string, ctx: any) => Promise<void>>();
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "glm.loop.state",
        data: {
          enabled: true,
          profile: "code",
          maxRounds: 3,
          failureMode: "handoff",
          autoVerify: true,
          verifyCommand: "pnpm test",
        },
      },
      {
        type: "custom",
        customType: "glm.loop.result",
        data: {
          status: "handoff",
          task: "fix lint",
          rounds: 3,
          verifier: "pnpm test",
          summary: "lint still failing",
          outcome: "Loop stopped and requires human handoff.",
          completedAt: "2026-04-16T00:00:01.000Z",
        },
      },
      {
        type: "custom",
        customType: "glm.loop.result",
        data: {
          status: "succeeded",
          task: "fix tests",
          rounds: 2,
          verifier: "pnpm test",
          summary: "all tests passed",
          outcome: "Loop succeeded after 2 rounds.",
          completedAt: "2026-04-16T00:00:02.000Z",
        },
      },
      {
        type: "custom",
        customType: "glm.loop.result",
        data: {
          status: "failed",
          task: "fix build",
          rounds: 1,
          verifier: "pnpm test",
          summary: "build script crashed",
          outcome: "Loop stopped with failure.",
          completedAt: "2026-04-16T00:00:03.000Z",
        },
      },
    ];
    const messages: string[] = [];

    registerLoopExtension({
      registerCommand: (name: string, options: { handler: (args: string, ctx: any) => Promise<void> }) => {
        commands.set(name, options.handler);
      },
      on: vi.fn(),
      sendMessage: (message: { content: string }) => {
        messages.push(message.content);
      },
      sendUserMessage: vi.fn(),
      appendEntry: vi.fn(),
      exec: vi.fn(),
    } as unknown as ExtensionAPI);

    const ctx = {
      cwd: process.cwd(),
      sessionManager: {
        getEntries: () => entries,
        getSessionId: () => "session-show",
      },
      isIdle: () => true,
      waitForIdle: vi.fn(async () => undefined),
      ui: {
        notify: vi.fn(),
      },
    };

    await commands.get("loop")?.("show 2", ctx);

    expect(messages[messages.length - 1]).toContain("Loop result #2");
    expect(messages[messages.length - 1]).toContain("Status: succeeded");
    expect(messages[messages.length - 1]).toContain("Task: fix tests");
    expect(messages[messages.length - 1]).toContain("Rounds: 2");
    expect(messages[messages.length - 1]).toContain("Verifier: pnpm test");
    expect(messages[messages.length - 1]).toContain("Outcome: Loop succeeded after 2 rounds.");
  });

  test("/loop show includes verifier output summaries for new-format results", async () => {
    const { default: registerLoopExtension } = await import(
      "../../resources/extensions/glm-loop/index.js"
    );

    const commands = new Map<string, (args: string, ctx: any) => Promise<void>>();
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "glm.loop.state",
        data: {
          enabled: true,
          profile: "code",
          maxRounds: 3,
          failureMode: "handoff",
          autoVerify: true,
          verifyCommand: "pnpm test",
        },
      },
      {
        type: "custom",
        customType: "glm.loop.result",
        data: {
          status: "failed",
          task: "fix build",
          rounds: 1,
          verification: {
            kind: "fail",
            command: "pnpm test",
            exitCode: 1,
            summary: "build script crashed",
            stdoutSummary: "test runner started",
            stderrSummary: "build script crashed",
          },
          outcome: "Loop stopped with failure.",
          completedAt: "2026-04-16T00:00:03.000Z",
        },
      },
    ];
    const messages: string[] = [];

    registerLoopExtension({
      registerCommand: (name: string, options: { handler: (args: string, ctx: any) => Promise<void> }) => {
        commands.set(name, options.handler);
      },
      on: vi.fn(),
      sendMessage: (message: { content: string }) => {
        messages.push(message.content);
      },
      sendUserMessage: vi.fn(),
      appendEntry: vi.fn(),
      exec: vi.fn(),
    } as unknown as ExtensionAPI);

    const ctx = {
      cwd: process.cwd(),
      sessionManager: {
        getEntries: () => entries,
        getSessionId: () => "session-show-new-format",
      },
      isIdle: () => true,
      waitForIdle: vi.fn(async () => undefined),
      ui: {
        notify: vi.fn(),
      },
    };

    await commands.get("loop")?.("show 1", ctx);

    expect(messages[messages.length - 1]).toContain("Verification kind: fail");
    expect(messages[messages.length - 1]).toContain("Exit code: 1");
    expect(messages[messages.length - 1]).toContain("Stdout summary: test runner started");
    expect(messages[messages.length - 1]).toContain("Stderr summary: build script crashed");
  });

  test("/loop show reports when the requested result index does not exist", async () => {
    const { default: registerLoopExtension } = await import(
      "../../resources/extensions/glm-loop/index.js"
    );

    const commands = new Map<string, (args: string, ctx: any) => Promise<void>>();
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "glm.loop.state",
        data: {
          enabled: true,
          profile: "code",
          maxRounds: 3,
          failureMode: "handoff",
          autoVerify: true,
          verifyCommand: "pnpm test",
        },
      },
      {
        type: "custom",
        customType: "glm.loop.result",
        data: {
          status: "succeeded",
          task: "fix tests",
          rounds: 2,
          verifier: "pnpm test",
          summary: "all tests passed",
          outcome: "Loop succeeded after 2 rounds.",
          completedAt: "2026-04-16T00:00:02.000Z",
        },
      },
    ];
    const messages: string[] = [];

    registerLoopExtension({
      registerCommand: (name: string, options: { handler: (args: string, ctx: any) => Promise<void> }) => {
        commands.set(name, options.handler);
      },
      on: vi.fn(),
      sendMessage: (message: { content: string }) => {
        messages.push(message.content);
      },
      sendUserMessage: vi.fn(),
      appendEntry: vi.fn(),
      exec: vi.fn(),
    } as unknown as ExtensionAPI);

    const ctx = {
      cwd: process.cwd(),
      sessionManager: {
        getEntries: () => entries,
        getSessionId: () => "session-show-missing",
      },
      isIdle: () => true,
      waitForIdle: vi.fn(async () => undefined),
      ui: {
        notify: vi.fn(),
      },
    };

    await commands.get("loop")?.("show 5", ctx);

    expect(messages[messages.length - 1]).toContain("Loop result #5 was not found.");
  });

  test("manual /loop run suppresses auto loop lifecycle hooks for the same session", async () => {
    const { default: registerLoopExtension } = await import(
      "../../resources/extensions/glm-loop/index.js"
    );

    const commands = new Map<string, (args: string, ctx: any) => Promise<void>>();
    const events = new Map<string, (event: any, ctx: any) => Promise<void>>();
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "glm.loop.state",
        data: {
          enabled: true,
          profile: "code",
          maxRounds: 1,
          failureMode: "handoff",
          autoVerify: true,
          verifyCommand: "pnpm test",
        },
      },
    ];
    const exec = vi.fn().mockResolvedValue({
      stdout: "all tests passed\n",
      stderr: "",
      code: 0,
      killed: false,
    });
    const userMessages: string[] = [];

    registerLoopExtension({
      registerCommand: (name: string, options: { handler: (args: string, ctx: any) => Promise<void> }) => {
        commands.set(name, options.handler);
      },
      on: (event: string, handler: (event: any, ctx: any) => Promise<void>) => {
        events.set(event, handler);
      },
      sendMessage: vi.fn(),
      sendUserMessage: (content: string) => {
        userMessages.push(content);
      },
      appendEntry: vi.fn(),
      exec,
    } as unknown as ExtensionAPI);

    const ctx = {
      cwd: process.cwd(),
      sessionManager: {
        getEntries: () => entries,
        getSessionId: () => "session-2",
      },
      isIdle: () => true,
      waitForIdle: vi.fn(async () => undefined),
      ui: {
        notify: vi.fn(),
      },
    };

    const runLoop = commands.get("loop");
    expect(runLoop).toBeTypeOf("function");

    const runPromise = runLoop?.("run fix tests", ctx);
    await events.get("before_agent_start")?.({ prompt: "internal loop turn" }, ctx);
    await events.get("agent_end")?.({ messages: [] }, ctx);
    await runPromise;

    expect(exec).toHaveBeenCalledTimes(1);
    expect(userMessages).toHaveLength(1);
  });
});
