import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { appendRuntimeEvent } from "../shared/runtime-state.js";
import {
  getSessionMemoryPath,
  readSessionMemory,
  upsertSessionMemoryCompaction,
  upsertSessionMemoryOperatorNotes,
  type SessionMemory,
} from "../../../src/harness/session-memory.js";

const MEMORY_WIDGET_KEY = "glm.memory";

function emitMemoryMessage(pi: ExtensionAPI, lines: string[]): void {
  pi.sendMessage(
    {
      customType: "glm.memory",
      content: lines.join("\n"),
      display: true,
      details: {},
    },
    { triggerTurn: false, deliverAs: "nextTurn" },
  );
}

function formatMemoryLines(args: {
  memoryPath: string;
  memory?: SessionMemory;
}): string[] {
  if (!args.memory) {
    return [
      "Session memory: none",
      `Path: ${args.memoryPath}`,
      "",
      "No memory record has been stored for this session yet.",
      "Run /compact to generate a compaction summary, or use /memory note <text> to store operator notes.",
    ];
  }

  const latest = args.memory.compactions.at(-1);
  const compactionSummary = latest
    ? `${latest.summary}${latest.tokensBefore ? ` (tokensBefore=${latest.tokensBefore})` : ""}`
    : "none";

  return [
    `Session memory: v${args.memory.version}`,
    `Path: ${args.memoryPath}`,
    `Updated: ${args.memory.updatedAt}`,
    `Compactions: ${args.memory.compactions.length} | latest: ${compactionSummary}`,
    `Operator notes: ${args.memory.operatorNotes ? "set" : "none"}`,
    ...(args.memory.operatorNotes ? ["", args.memory.operatorNotes] : []),
  ];
}

async function showMemory(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
  const sessionDir = ctx.sessionManager.getSessionDir();
  const sessionId = ctx.sessionManager.getSessionId();
  const memoryPath = getSessionMemoryPath(sessionDir, sessionId);
  const memory = await readSessionMemory({ sessionDir, sessionId });
  const lines = formatMemoryLines({ memoryPath, memory });

  if (ctx.hasUI) {
    ctx.ui.setWidget(MEMORY_WIDGET_KEY, lines, { placement: "belowEditor" });
    ctx.ui.notify("Updated memory widget", "info");
    return;
  }

  emitMemoryMessage(pi, lines);
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("memory", {
    description: "Show or update glm session memory (compaction summaries + operator notes).",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const [subcommand, ...rest] = trimmed.split(/\s+/).filter(Boolean);

      if (!subcommand || subcommand === "show" || subcommand === "status") {
        await showMemory(pi, ctx);
        return;
      }

      if (subcommand === "path") {
        const sessionDir = ctx.sessionManager.getSessionDir();
        const sessionId = ctx.sessionManager.getSessionId();
        const memoryPath = getSessionMemoryPath(sessionDir, sessionId);
        const lines = [`Path: ${memoryPath}`];
        if (ctx.hasUI) {
          ctx.ui.notify(lines[0], "info");
        } else {
          emitMemoryMessage(pi, lines);
        }
        return;
      }

      if (subcommand === "note") {
        const note = rest.join(" ").trim();
        if (!note) {
          const lines = ["Usage: /memory note <text>"];
          if (ctx.hasUI) {
            ctx.ui.notify(lines[0], "error");
          } else {
            emitMemoryMessage(pi, lines);
          }
          return;
        }

        const sessionDir = ctx.sessionManager.getSessionDir();
        const sessionId = ctx.sessionManager.getSessionId();
        const sessionFile = ctx.sessionManager.getSessionFile();

        await upsertSessionMemoryOperatorNotes({
          sessionDir,
          sessionId,
          ...(sessionFile ? { sessionFile } : {}),
          operatorNotes: note,
        });

        appendRuntimeEvent({
          type: "memory.note",
          summary: "updated operator notes",
        });

        await showMemory(pi, ctx);
        return;
      }

      if (subcommand === "clear-notes") {
        const sessionDir = ctx.sessionManager.getSessionDir();
        const sessionId = ctx.sessionManager.getSessionId();
        const sessionFile = ctx.sessionManager.getSessionFile();

        await upsertSessionMemoryOperatorNotes({
          sessionDir,
          sessionId,
          ...(sessionFile ? { sessionFile } : {}),
          operatorNotes: undefined,
        });

        appendRuntimeEvent({
          type: "memory.note",
          summary: "cleared operator notes",
        });

        await showMemory(pi, ctx);
        return;
      }

      if (subcommand === "help") {
        const lines = [
          "Usage: /memory [show|status]",
          "  /memory note <text>         Set operator notes for the session",
          "  /memory clear-notes         Remove operator notes",
          "  /memory path                Print the session memory path",
        ];
        if (ctx.hasUI) {
          ctx.ui.notify(lines.join("\n"), "info");
        } else {
          emitMemoryMessage(pi, lines);
        }
        return;
      }

      if (ctx.hasUI) {
        ctx.ui.notify("Unknown /memory subcommand. Try /memory help.", "error");
      } else {
        emitMemoryMessage(pi, ["Unknown /memory subcommand. Try /memory help."]);
      }
    },
  });

  pi.on("session_compact", async (event, ctx) => {
    const sessionDir = ctx.sessionManager.getSessionDir();
    const sessionId = ctx.sessionManager.getSessionId();
    const sessionFile = ctx.sessionManager.getSessionFile();

    await upsertSessionMemoryCompaction({
      sessionDir,
      sessionId,
      ...(sessionFile ? { sessionFile } : {}),
      compaction: {
        entryId: event.compactionEntry.id,
        at: event.compactionEntry.timestamp,
        summary: event.compactionEntry.summary,
        tokensBefore: event.compactionEntry.tokensBefore,
      },
    });

    appendRuntimeEvent({
      type: "memory.compaction",
      summary: "stored compaction summary in session memory",
      details: {
        compactionEntryId: event.compactionEntry.id,
      },
    });
  });
}

