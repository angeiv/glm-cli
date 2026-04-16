import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSessionRuntime } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, test, vi } from "vitest";
import { runTaskLoop } from "../../src/runtime/run-runtime.js";

type FakeRuntime = AgentSessionRuntime & {
  session: {
    state: {
      messages: Array<Record<string, unknown>>;
    };
    bindExtensions: ReturnType<typeof vi.fn>;
    prompt: ReturnType<typeof vi.fn>;
    agent: {
      waitForIdle: ReturnType<typeof vi.fn>;
    };
    navigateTree: ReturnType<typeof vi.fn>;
    reload: ReturnType<typeof vi.fn>;
  };
  dispose: ReturnType<typeof vi.fn>;
};

function createFakeRuntime(cwd: string, replies: string[]): FakeRuntime {
  const state = {
    messages: [] as Array<Record<string, unknown>>,
  };

  const runtime = {
    cwd,
    session: {
      state,
      bindExtensions: vi.fn(async () => undefined),
      prompt: vi.fn(async (message: string) => {
        state.messages.push({ role: "user", content: [{ type: "text", text: message }] });
        state.messages.push({
          role: "assistant",
          stopReason: "stop",
          content: [{ type: "text", text: replies.shift() ?? "ok" }],
        });
      }),
      agent: {
        waitForIdle: vi.fn(async () => undefined),
      },
      navigateTree: vi.fn(async () => ({ cancelled: false })),
      reload: vi.fn(async () => undefined),
    },
    newSession: vi.fn(async () => ({ cancelled: false })),
    fork: vi.fn(async () => ({ cancelled: false })),
    switchSession: vi.fn(async () => ({ cancelled: false })),
    dispose: vi.fn(async () => undefined),
  };

  return runtime as unknown as FakeRuntime;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runTaskLoop", () => {
  test("repairs once and succeeds when verifier passes on the second round", async () => {
    const dir = mkdtempSync(join(tmpdir(), "glm-run-loop-"));
    const flagPath = join(dir, "verify-once.cjs");
    writeFileSync(
      flagPath,
      [
        'const fs = require("node:fs");',
        'const path = require("node:path");',
        'const flag = path.join(process.cwd(), ".loop-pass");',
        'if (fs.existsSync(flag)) process.exit(0);',
        'fs.writeFileSync(flag, "1", "utf8");',
        'console.error("first verification failed");',
        "process.exit(1);",
      ].join("\n"),
      "utf8",
    );

    const runtime = createFakeRuntime(dir, ["first attempt", "repair attempt"]);
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    const exitCode = await runTaskLoop(runtime, "fix tests", {
      enabled: true,
      profile: "code",
      maxRounds: 2,
      failureMode: "handoff",
      autoVerify: true,
      verifyCommand: `node "${flagPath}"`,
    });

    expect(exitCode).toBe(0);
    expect(runtime.session.prompt).toHaveBeenCalledTimes(2);
    expect(runtime.dispose).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("Loop succeeded after 2 rounds."));
  });

  test("hands off after one round when verification is unavailable", async () => {
    const dir = mkdtempSync(join(tmpdir(), "glm-run-loop-"));
    const runtime = createFakeRuntime(dir, ["initial attempt"]);
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    const exitCode = await runTaskLoop(runtime, "fix tests", {
      enabled: true,
      profile: "code",
      maxRounds: 3,
      failureMode: "handoff",
      autoVerify: false,
    });

    expect(exitCode).toBe(1);
    expect(runtime.session.prompt).toHaveBeenCalledTimes(1);
    expect(runtime.dispose).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("requires human handoff"),
    );
  });
});
