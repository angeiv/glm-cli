import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
    expect(events.map((event) => event.type)).toEqual(["loop.verify", "mcp.connect_failed"]);
  });

  test("clearRuntimeEvents removes all retained events", () => {
    appendRuntimeEvent({ type: "approval.changed", summary: "approval set to auto" });
    expect(getRuntimeEvents()).toHaveLength(1);

    clearRuntimeEvents();
    expect(getRuntimeEvents()).toHaveLength(0);
  });

  test("optionally persists events as JSONL without details", () => {
    const dir = mkdtempSync(join(tmpdir(), "glm-eventlog-"));
    const path = join(dir, "events.jsonl");
    configureRuntimeEventLog({ limit: 200, persistPath: path });

    const summary = "x".repeat(800);
    appendRuntimeEvent({
      type: "hooks.run",
      summary,
      details: { shouldNotPersist: true },
    });

    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);

    const persisted = JSON.parse(lines[0]);
    expect(persisted).toMatchObject({
      type: "hooks.run",
      level: "info",
    });
    expect(persisted.summary).toHaveLength(503);
    expect(persisted).not.toHaveProperty("details");
  });
});
