import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  getSessionMemoryPath,
  readSessionMemory,
  upsertSessionMemoryCompaction,
  upsertSessionMemoryOperatorNotes,
} from "../../src/harness/session-memory.js";

describe("session memory", () => {
  test("writes and reads operator notes", async () => {
    const sessionDir = join(tmpdir(), `glm-session-memory-${Date.now()}`);
    const sessionId = "test-session";
    mkdirSync(join(sessionDir, "artifacts"), { recursive: true });

    const { path } = await upsertSessionMemoryOperatorNotes({
      sessionDir,
      sessionId,
      operatorNotes: "prefer pnpm; keep commits atomic",
    });

    expect(path).toBe(getSessionMemoryPath(sessionDir, sessionId));

    const memory = await readSessionMemory({ sessionDir, sessionId });
    expect(memory).toMatchObject({
      kind: "glm.sessionMemory",
      version: 1,
      sessionId,
      operatorNotes: "prefer pnpm; keep commits atomic",
      compactions: [],
    });
  });

  test("appends compaction history and caps at maxHistory", async () => {
    const sessionDir = join(tmpdir(), `glm-session-memory-compact-${Date.now()}`);
    const sessionId = "test-session";

    await upsertSessionMemoryCompaction({
      sessionDir,
      sessionId,
      compaction: {
        entryId: "c1",
        at: "2026-04-25T00:00:00.000Z",
        summary: "first",
        tokensBefore: 123,
      },
      maxHistory: 2,
    });

    await upsertSessionMemoryCompaction({
      sessionDir,
      sessionId,
      compaction: {
        entryId: "c2",
        at: "2026-04-25T01:00:00.000Z",
        summary: "second",
        tokensBefore: 456,
      },
      maxHistory: 2,
    });

    await upsertSessionMemoryCompaction({
      sessionDir,
      sessionId,
      compaction: {
        entryId: "c3",
        at: "2026-04-25T02:00:00.000Z",
        summary: "third",
        tokensBefore: 789,
      },
      maxHistory: 2,
    });

    const memory = await readSessionMemory({ sessionDir, sessionId });
    expect(memory?.compactions.map((record) => record.entryId)).toEqual(["c2", "c3"]);

    const payload = readFileSync(getSessionMemoryPath(sessionDir, sessionId), "utf8");
    expect(payload).toContain("\"entryId\": \"c3\"");
  });
});

