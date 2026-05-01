import type { CompactionResult, ExtensionAPI, SessionEntry } from "@mariozechner/pi-coding-agent";
import { compact } from "@mariozechner/pi-coding-agent";
import { appendRuntimeEvent, getRuntimeStatus } from "../shared/runtime-state.js";

const LOOP_STATE_ENTRY = "glm.loop.state";
const LOOP_RESULT_ENTRY = "glm.loop.result";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readLatestCustomEntry(entries: SessionEntry[], customType: string): unknown | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i] as SessionEntry & { customType?: string; data?: unknown };
    if (entry.type !== "custom") continue;
    if (entry.customType !== customType) continue;
    return entry.data;
  }
  return undefined;
}

function formatLoopState(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;

  const enabled = readBoolean(value.enabled);
  const profile = readString(value.profile);
  const maxRounds = readNumber(value.maxRounds);
  const failureMode = readString(value.failureMode);
  const autoVerify = readBoolean(value.autoVerify);
  const verifyCommand = readString(value.verifyCommand);

  const parts = [
    enabled === undefined ? undefined : `enabled=${enabled ? "on" : "off"}`,
    profile ? `profile=${profile}` : undefined,
    maxRounds === undefined ? undefined : `maxRounds=${maxRounds}`,
    failureMode ? `failMode=${failureMode}` : undefined,
    autoVerify === undefined ? undefined : `autoVerify=${autoVerify ? "on" : "off"}`,
    verifyCommand ? `verify=${verifyCommand}` : undefined,
  ].filter(Boolean) as string[];

  return parts.length ? parts.join(" | ") : undefined;
}

function formatLoopResult(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;

  const status = readString(value.status);
  const task = readString(value.task);
  const rounds = readNumber(value.rounds);
  const completedAt = readString(value.completedAt);
  const outcome = readString(value.outcome);

  const verification = isRecord(value.verification) ? value.verification : undefined;
  const verificationKind = verification ? readString(verification.kind) : undefined;
  const verificationCommand = verification ? readString(verification.command) : undefined;
  const verificationExitCode = verification ? readNumber(verification.exitCode) : undefined;
  const verificationSummary = verification ? readString(verification.summary) : undefined;
  const artifactPath = verification ? readString(verification.artifactPath) : undefined;

  const parts = [
    status ? `status=${status}` : undefined,
    task ? `task=${task}` : undefined,
    rounds === undefined ? undefined : `rounds=${rounds}`,
    verificationKind ? `verify.kind=${verificationKind}` : undefined,
    verificationCommand ? `verify.command=${verificationCommand}` : undefined,
    verificationExitCode === undefined ? undefined : `verify.exitCode=${verificationExitCode}`,
    verificationSummary ? `verify.summary=${verificationSummary}` : undefined,
    artifactPath ? `verify.artifact=${artifactPath}` : undefined,
    completedAt ? `completedAt=${completedAt}` : undefined,
    outcome ? `outcome=${outcome}` : undefined,
  ].filter(Boolean) as string[];

  return parts.length ? parts.join(" | ") : undefined;
}

function formatCompactionFocus(): string {
  const runtime = getRuntimeStatus();

  const lines: string[] = [
    "Preserve handoff-critical state even if it only appears in session metadata (not the chat transcript).",
    "Make sure the summary remains actionable after compaction (a human should be able to take over).",
    'Include these facts under "Critical Context" or "Progress" (do not invent missing values):',
  ];

  if (runtime) {
    lines.push(
      `Runtime: provider=${runtime.provider} | model=${runtime.model} | approvalPolicy=${runtime.approvalPolicy}`,
    );
    if (runtime.loop) {
      lines.push(
        `Loop (runtime): ${runtime.loop.enabled ? "on" : "off"} | profile=${runtime.loop.profile} | maxRounds=${runtime.loop.maxRounds} | failMode=${runtime.loop.failureMode} | verify=${runtime.loop.verifyCommand ?? runtime.loop.verifyFallbackCommand ?? "auto-detect"}`,
      );
    }
    if (runtime.verification?.latest) {
      lines.push(
        `Verification (latest): ${runtime.verification.latest.kind} | ${runtime.verification.latest.command ?? "no command"} | ${runtime.verification.latest.summary} | ${runtime.verification.latest.artifactPath}`,
      );
    }
  }

  return lines.join("\n");
}

function stripXmlTagBlocks(text: string, tag: string): string {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  let next = text;
  while (true) {
    const start = next.indexOf(open);
    if (start === -1) break;
    const end = next.indexOf(close, start);
    if (end === -1) break;
    next = `${next.slice(0, start).trimEnd()}\n${next.slice(end + close.length).trimStart()}`;
  }
  return next;
}

function formatFileOperations(readFiles: string[], modifiedFiles: string[]): string {
  const sections: string[] = [];

  if (readFiles.length > 0) {
    sections.push(`<read-files>\n${readFiles.join("\n")}\n</read-files>`);
  }

  if (modifiedFiles.length > 0) {
    sections.push(`<modified-files>\n${modifiedFiles.join("\n")}\n</modified-files>`);
  }

  if (sections.length === 0) return "";
  return `\n\n${sections.join("\n\n")}`;
}

function collectFileOps(entries: SessionEntry[]): { readFiles: string[]; modifiedFiles: string[] } {
  const read = new Set<string>();
  const modified = new Set<string>();

  for (const entry of entries) {
    if (entry.type !== "compaction") continue;
    const details = (entry as SessionEntry & { details?: unknown }).details;
    if (!isRecord(details)) continue;
    const readFiles = details.readFiles;
    const modifiedFiles = details.modifiedFiles;
    if (Array.isArray(readFiles)) {
      for (const file of readFiles) {
        if (typeof file === "string" && file.trim()) {
          read.add(file);
        }
      }
    }
    if (Array.isArray(modifiedFiles)) {
      for (const file of modifiedFiles) {
        if (typeof file === "string" && file.trim()) {
          modified.add(file);
        }
      }
    }
  }

  // Ensure readFiles excludes anything modified.
  for (const file of modified) {
    read.delete(file);
  }

  return {
    readFiles: [...read].sort(),
    modifiedFiles: [...modified].sort(),
  };
}

function mergeFileOps(
  previous: { readFiles: string[]; modifiedFiles: string[] },
  current: { readFiles: string[]; modifiedFiles: string[] },
): { readFiles: string[]; modifiedFiles: string[] } {
  const read = new Set<string>(previous.readFiles);
  const modified = new Set<string>(previous.modifiedFiles);

  for (const file of current.readFiles) read.add(file);
  for (const file of current.modifiedFiles) modified.add(file);

  // Ensure readFiles excludes anything modified.
  for (const file of modified) {
    read.delete(file);
  }

  return {
    readFiles: [...read].sort(),
    modifiedFiles: [...modified].sort(),
  };
}

function extractFileOpsFromCompactionResult(result: CompactionResult): {
  readFiles: string[];
  modifiedFiles: string[];
} {
  const details = result.details;
  if (!isRecord(details)) {
    return { readFiles: [], modifiedFiles: [] };
  }

  const readFiles = Array.isArray(details.readFiles)
    ? details.readFiles.filter((f) => typeof f === "string" && f.trim())
    : [];
  const modifiedFiles = Array.isArray(details.modifiedFiles)
    ? details.modifiedFiles.filter((f) => typeof f === "string" && f.trim())
    : [];

  const read = new Set(readFiles);
  const modified = new Set(modifiedFiles);
  for (const file of modified) {
    read.delete(file);
  }

  return {
    readFiles: [...read].sort(),
    modifiedFiles: [...modified].sort(),
  };
}

export default function (pi: ExtensionAPI) {
  pi.on("session_before_compact", async (event, ctx) => {
    if (!ctx.model) return;

    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
    if (!auth.ok || !auth.apiKey) {
      appendRuntimeEvent({
        type: "compaction.auth_missing",
        level: "warn",
        summary: "Skipping compaction focus injection (no API key available)",
      });
      return;
    }

    const loopState = formatLoopState(readLatestCustomEntry(event.branchEntries, LOOP_STATE_ENTRY));
    const loopResult = formatLoopResult(
      readLatestCustomEntry(event.branchEntries, LOOP_RESULT_ENTRY),
    );

    const focusLines = [formatCompactionFocus()];
    if (loopState) {
      focusLines.push(`Loop (persisted): ${loopState}`);
    }
    if (loopResult) {
      focusLines.push(`Loop result (latest): ${loopResult}`);
    }
    if (event.customInstructions?.trim()) {
      focusLines.push("");
      focusLines.push(`User requested focus: ${event.customInstructions.trim()}`);
    }

    const customInstructions = focusLines.join("\n");

    try {
      const base = await compact(
        event.preparation,
        ctx.model,
        auth.apiKey,
        auth.headers,
        customInstructions,
        event.signal,
      );

      const previousOps = collectFileOps(event.branchEntries);
      const currentOps = extractFileOpsFromCompactionResult(base);
      const mergedOps = mergeFileOps(previousOps, currentOps);

      let summary = base.summary;
      summary = stripXmlTagBlocks(summary, "read-files");
      summary = stripXmlTagBlocks(summary, "modified-files");
      summary =
        summary.trimEnd() + formatFileOperations(mergedOps.readFiles, mergedOps.modifiedFiles);

      appendRuntimeEvent({
        type: "compaction.summary_generated",
        summary: `Generated focused compaction summary (tokensBefore=${base.tokensBefore})`,
        details: {
          firstKeptEntryId: base.firstKeptEntryId,
          readFiles: mergedOps.readFiles,
          modifiedFiles: mergedOps.modifiedFiles,
        },
      });

      return {
        compaction: {
          summary,
          firstKeptEntryId: base.firstKeptEntryId,
          tokensBefore: base.tokensBefore,
          details: mergedOps,
        },
      };
    } catch (error) {
      appendRuntimeEvent({
        type: "compaction.summary_failed",
        level: "warn",
        summary: `Focused compaction failed; falling back to default: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }
  });

  pi.on("session_compact", (event) => {
    appendRuntimeEvent({
      type: "compaction.completed",
      summary: `Session compacted (fromExtension=${event.fromExtension ? "yes" : "no"})`,
      details: {
        compactionEntryId: (event.compactionEntry as any)?.id,
        tokensBefore: (event.compactionEntry as any)?.tokensBefore,
      },
    });
  });
}
