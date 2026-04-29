import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSessionRuntime } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, test, vi } from "vitest";
import { runSingleTask } from "../../src/runtime/run-runtime.js";

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

function createFakeRuntime(cwd: string, replyText = "ok"): FakeRuntime {
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
          content: [{ type: "text", text: replyText }],
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

describe("runSingleTask", () => {
  test("uses the provided prompt mode for the task overlay", async () => {
    const dir = mkdtempSync(join(tmpdir(), "glm-run-single-"));
    const runtime = createFakeRuntime(dir);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const result = await runSingleTask(runtime, "fix tests", "direct");

    expect(result.exitCode).toBe(0);
    expect(runtime.session.prompt).toHaveBeenCalledTimes(1);
    expect(runtime.session.prompt).toHaveBeenCalledWith(
      expect.stringContaining("Task overlay (direct):"),
      expect.anything(),
    );
    expect(runtime.dispose).toHaveBeenCalledTimes(1);
  });
});
