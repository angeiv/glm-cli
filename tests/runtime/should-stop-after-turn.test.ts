import { afterEach, describe, expect, test } from "vitest";
import { clearRuntimeEvents, getRuntimeEvents } from "../../src/diagnostics/event-log.js";
import {
  installShouldStopAfterTurn,
  shouldStopForQueuedCompaction,
} from "../../src/runtime/should-stop-after-turn.js";

describe("shouldStopAfterTurn queued compaction guard", () => {
  afterEach(() => {
    clearRuntimeEvents();
  });

  test("returns true when queued messages should yield to compaction", () => {
    const stop = shouldStopForQueuedCompaction({
      hasQueuedMessages: true,
      contextWindow: 100_000,
      compactionEnabled: true,
      reserveTokens: 8_192,
      message: {
        role: "assistant",
        stopReason: "stop",
        usage: {
          input: 92_000,
          output: 4_000,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 96_000,
        },
      },
    });

    expect(stop).toBe(true);
  });

  test("returns false when there are no queued messages", () => {
    const stop = shouldStopForQueuedCompaction({
      hasQueuedMessages: false,
      contextWindow: 100_000,
      compactionEnabled: true,
      reserveTokens: 8_192,
      message: {
        role: "assistant",
        stopReason: "stop",
        usage: {
          input: 92_000,
          output: 4_000,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 96_000,
        },
      },
    });

    expect(stop).toBe(false);
  });

  test("wraps agent loop config and emits a runtime event when it stops after a turn", async () => {
    const agent = {
      state: {
        model: {
          provider: "glm",
          id: "glm-5.1",
          contextWindow: 100_000,
        },
      },
      hasQueuedMessages: () => true,
      createLoopConfig: () => ({}),
    };
    const session = {
      agent,
      settingsManager: {
        getCompactionSettings: () => ({
          enabled: true,
          reserveTokens: 8_192,
        }),
      },
    };

    installShouldStopAfterTurn(session as never);
    const config = agent.createLoopConfig();
    expect(typeof config.shouldStopAfterTurn).toBe("function");

    const stop = await config.shouldStopAfterTurn({
      message: {
        role: "assistant",
        provider: "glm",
        model: "glm-5.1",
        stopReason: "stop",
        usage: {
          input: 92_000,
          output: 4_000,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 96_000,
        },
      },
      toolResults: [],
      context: { messages: [] },
      newMessages: [],
    });

    expect(stop).toBe(true);
    expect(getRuntimeEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "turn.stop_after_turn",
          level: "info",
        }),
      ]),
    );
  });
});
