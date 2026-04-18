import { afterEach, describe, expect, test } from "vitest";
import {
  appendRuntimeEvent,
  clearRuntimeEvents,
  configureRuntimeEventLog,
  getRuntimeEvents,
} from "../../src/diagnostics/event-log.js";

afterEach(() => {
  clearRuntimeEvents();
  configureRuntimeEventLog({ limit: 200 });
});

describe("runtime event log", () => {
  test("retains the newest events within the configured limit", () => {
    configureRuntimeEventLog({ limit: 2 });

    appendRuntimeEvent({ type: "approval.changed", summary: "approval set to auto" });
    appendRuntimeEvent({ type: "loop.verify", summary: "verification failed" });
    appendRuntimeEvent({ type: "mcp.connect_failed", summary: "reader timed out" });

    const events = getRuntimeEvents();
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.type)).toEqual([
      "loop.verify",
      "mcp.connect_failed",
    ]);
  });

  test("clearRuntimeEvents removes all retained events", () => {
    appendRuntimeEvent({ type: "approval.changed", summary: "approval set to auto" });
    expect(getRuntimeEvents()).toHaveLength(1);

    clearRuntimeEvents();
    expect(getRuntimeEvents()).toHaveLength(0);
  });
});
