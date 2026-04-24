import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("glm-notify extension", () => {
  test("sends a system notification when a normal turn finishes and notifications are enabled", async () => {
    process.env.GLM_NOTIFY_ENABLED = "1";
    process.env.GLM_NOTIFY_ON_TURN_END = "1";

    const { default: registerNotifyExtension } = await import(
      "../../resources/extensions/glm-notify/index.js"
    );

    const events = new Map<string, (event: any, ctx: any) => Promise<void>>();
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    registerNotifyExtension({
      on: (event: string, handler: (event: any, ctx: any) => Promise<void>) => {
        events.set(event, handler);
      },
    } as unknown as ExtensionAPI);

    await events.get("agent_end")?.(
      { messages: [] },
      {
        sessionManager: {
          getSessionId: () => "session-notify-normal",
        },
      },
    );

    expect(write).toHaveBeenCalled();
    expect(write.mock.calls.join("\n")).toContain("Ready for input");
  });

  test("skips the generic turn notification while a loop is active", async () => {
    process.env.GLM_NOTIFY_ENABLED = "1";
    process.env.GLM_NOTIFY_ON_TURN_END = "1";

    const { default: registerNotifyExtension } = await import(
      "../../resources/extensions/glm-notify/index.js"
    );
    const { setActiveLoopForTests, clearActiveLoopForTests } = await import(
      "../../resources/extensions/glm-loop/index.js"
    );

    const events = new Map<string, (event: any, ctx: any) => Promise<void>>();
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    setActiveLoopForTests("session-notify-loop", {
      mode: "auto",
      task: "fix tests",
      phase: "verify",
      currentRound: 1,
      rounds: [],
      state: {
        enabled: true,
        profile: "code",
        maxRounds: 3,
        failureMode: "handoff",
        autoVerify: true,
      },
      verifier: {
        kind: "command",
        command: "pnpm test",
        source: "session",
      },
      announceSuccess: false,
    });

    registerNotifyExtension({
      on: (event: string, handler: (event: any, ctx: any) => Promise<void>) => {
        events.set(event, handler);
      },
    } as unknown as ExtensionAPI);

    await events.get("agent_end")?.(
      { messages: [] },
      {
        sessionManager: {
          getSessionId: () => "session-notify-loop",
        },
      },
    );

    clearActiveLoopForTests("session-notify-loop");

    expect(write).not.toHaveBeenCalled();
  });
});
