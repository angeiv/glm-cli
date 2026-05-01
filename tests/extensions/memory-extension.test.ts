import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, test, vi } from "vitest";
import registerMemoryExtension from "../../resources/extensions/glm-memory/index.js";
import { getSessionMemoryPath } from "../../src/harness/session-memory.js";

afterEach(() => {
  const store = globalThis as Record<PropertyKey, unknown>;
  delete store[Symbol.for("glm.eventLog")];
});

describe("glm-memory extension", () => {
  test("registers /memory command", () => {
    const commands: string[] = [];

    registerMemoryExtension({
      on: vi.fn(),
      registerCommand: (name: string) => {
        commands.push(name);
      },
    } as unknown as ExtensionAPI);

    expect(commands).toContain("memory");
  });

  test("/memory prints path and status without UI", async () => {
    let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
    const messages: string[] = [];

    registerMemoryExtension({
      on: vi.fn(),
      registerCommand: (
        name: string,
        options: { handler: (args: string, ctx: any) => Promise<void> },
      ) => {
        if (name === "memory") {
          handler = options.handler;
        }
      },
      sendMessage: (message: { content: string }) => {
        messages.push(message.content);
      },
    } as unknown as ExtensionAPI);

    const sessionDir = join(tmpdir(), `glm-memory-ext-${Date.now()}`);
    const sessionId = "test-session";

    await handler?.("", {
      hasUI: false,
      sessionManager: {
        getSessionDir: () => sessionDir,
        getSessionId: () => sessionId,
        getSessionFile: () => join(sessionDir, `session-${sessionId}.jsonl`),
      },
    });

    expect(messages.join("\n")).toContain(getSessionMemoryPath(sessionDir, sessionId));
    expect(messages.join("\n")).toContain("Session memory: none");
  });

  test("stores compaction summary on session_compact", async () => {
    const handlers = new Map<string, any>();

    registerMemoryExtension({
      registerCommand: vi.fn(),
      sendMessage: vi.fn(),
      on: (event: string, handler: any) => {
        handlers.set(event, handler);
      },
    } as unknown as ExtensionAPI);

    const sessionDir = join(tmpdir(), `glm-memory-compaction-${Date.now()}`);
    const sessionId = "f80124bb-ca79-4c42-8e47-413fe8fdb7d8";
    const sessionFile = join(sessionDir, `2026-04-25T00-00-00-000Z_${sessionId}.jsonl`);

    const sessionCompact = handlers.get("session_compact");
    expect(sessionCompact).toBeTypeOf("function");

    await sessionCompact(
      {
        type: "session_compact",
        fromExtension: false,
        compactionEntry: {
          type: "compaction",
          id: "compaction-1",
          parentId: null,
          timestamp: "2026-04-25T00:00:00.000Z",
          summary: "compacted summary",
          firstKeptEntryId: "keep-1",
          tokensBefore: 1234,
        },
      },
      {
        hasUI: false,
        ui: {
          notify: vi.fn(),
        },
        sessionManager: {
          getSessionDir: () => sessionDir,
          getSessionId: () => sessionId,
          getSessionFile: () => sessionFile,
        },
      },
    );

    const memoryPath = getSessionMemoryPath(sessionDir, sessionId);
    expect(existsSync(memoryPath)).toBe(true);
    expect(readFileSync(memoryPath, "utf8")).toContain("compacted summary");
  });
});
