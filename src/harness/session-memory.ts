import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type SessionMemoryCompactionRecord = {
  entryId: string;
  at: string;
  summary: string;
  tokensBefore: number;
};

export type SessionMemoryVerificationSnapshot = {
  kind: string;
  command?: string;
  exitCode?: number;
  summary: string;
  artifactPath?: string;
};

export type SessionMemoryLoopResultSnapshot = {
  status: string;
  task: string;
  rounds: number;
  summary: string;
  completedAt?: string;
  verification?: SessionMemoryVerificationSnapshot;
};

export type SessionMemoryV1 = {
  kind: "glm.sessionMemory";
  version: 1;
  sessionId: string;
  sessionFile?: string;
  updatedAt: string;
  operatorNotes?: string;
  compactions: SessionMemoryCompactionRecord[];
};

export type SessionMemoryV2 = Omit<SessionMemoryV1, "version"> & {
  version: 2;
  latestLoopResult?: SessionMemoryLoopResultSnapshot;
};

export type SessionMemory = SessionMemoryV2;

const SESSION_MEMORY_KIND = "glm.sessionMemory";
const SESSION_MEMORY_VERSION = 2;
const DEFAULT_MAX_COMPACTION_HISTORY = 20;

export function getSessionMemoryPath(sessionDir: string, sessionId: string): string {
  return join(sessionDir, "artifacts", `memory-${sessionId}.json`);
}

function isSessionMemoryCompactionRecord(value: unknown): value is SessionMemoryCompactionRecord {
  if (!value || typeof value !== "object") return false;
  const rec = value as Partial<SessionMemoryCompactionRecord>;
  return (
    typeof rec.entryId === "string" &&
    !!rec.entryId.trim() &&
    typeof rec.at === "string" &&
    !!rec.at.trim() &&
    typeof rec.summary === "string" &&
    typeof rec.tokensBefore === "number"
  );
}

function isSessionMemoryVerificationSnapshot(
  value: unknown,
): value is SessionMemoryVerificationSnapshot {
  if (!value || typeof value !== "object") return false;
  const verification = value as Partial<SessionMemoryVerificationSnapshot>;
  if (typeof verification.kind !== "string" || !verification.kind.trim()) return false;
  if (verification.command !== undefined && typeof verification.command !== "string") return false;
  if (verification.exitCode !== undefined && typeof verification.exitCode !== "number") return false;
  if (typeof verification.summary !== "string") return false;
  if (verification.artifactPath !== undefined && typeof verification.artifactPath !== "string") {
    return false;
  }
  return true;
}

function isSessionMemoryLoopResultSnapshot(value: unknown): value is SessionMemoryLoopResultSnapshot {
  if (!value || typeof value !== "object") return false;
  const loop = value as Partial<SessionMemoryLoopResultSnapshot>;
  if (typeof loop.status !== "string" || !loop.status.trim()) return false;
  if (typeof loop.task !== "string" || !loop.task.trim()) return false;
  if (typeof loop.rounds !== "number") return false;
  if (typeof loop.summary !== "string") return false;
  if (loop.completedAt !== undefined && typeof loop.completedAt !== "string") return false;
  if (
    loop.verification !== undefined &&
    !isSessionMemoryVerificationSnapshot(loop.verification)
  ) {
    return false;
  }
  return true;
}

function isSessionMemoryV1(value: unknown): value is SessionMemoryV1 {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<SessionMemoryV1>;
  if (maybe.kind !== SESSION_MEMORY_KIND) return false;
  if (maybe.version !== 1) return false;
  if (typeof maybe.sessionId !== "string" || !maybe.sessionId.trim()) return false;
  if (typeof maybe.updatedAt !== "string" || !maybe.updatedAt.trim()) return false;
  if (!Array.isArray(maybe.compactions)) return false;

  for (const record of maybe.compactions) {
    if (!isSessionMemoryCompactionRecord(record)) return false;
  }

  if (maybe.operatorNotes !== undefined && typeof maybe.operatorNotes !== "string") {
    return false;
  }

  if (maybe.sessionFile !== undefined && typeof maybe.sessionFile !== "string") {
    return false;
  }

  return true;
}

function isSessionMemoryV2(value: unknown): value is SessionMemoryV2 {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<SessionMemoryV2>;
  if (maybe.kind !== SESSION_MEMORY_KIND) return false;
  if (maybe.version !== SESSION_MEMORY_VERSION) return false;
  if (typeof maybe.sessionId !== "string" || !maybe.sessionId.trim()) return false;
  if (typeof maybe.updatedAt !== "string" || !maybe.updatedAt.trim()) return false;
  if (!Array.isArray(maybe.compactions)) return false;

  for (const record of maybe.compactions) {
    if (!isSessionMemoryCompactionRecord(record)) return false;
  }

  if (maybe.operatorNotes !== undefined && typeof maybe.operatorNotes !== "string") {
    return false;
  }

  if (maybe.sessionFile !== undefined && typeof maybe.sessionFile !== "string") {
    return false;
  }

  if (
    maybe.latestLoopResult !== undefined &&
    !isSessionMemoryLoopResultSnapshot(maybe.latestLoopResult)
  ) {
    return false;
  }

  return true;
}

function normalizeSessionMemory(value: unknown): SessionMemory | undefined {
  if (isSessionMemoryV2(value)) {
    return value;
  }

  if (!isSessionMemoryV1(value)) {
    return undefined;
  }

  return {
    ...value,
    version: SESSION_MEMORY_VERSION,
  };
}

function createEmptyMemory(args: { sessionId: string; sessionFile?: string }): SessionMemory {
  return {
    kind: SESSION_MEMORY_KIND,
    version: SESSION_MEMORY_VERSION,
    sessionId: args.sessionId,
    ...(args.sessionFile ? { sessionFile: args.sessionFile } : {}),
    updatedAt: new Date().toISOString(),
    compactions: [],
  };
}

async function ensureArtifactDir(sessionDir: string): Promise<string> {
  const artifactDir = join(sessionDir, "artifacts");
  await mkdir(artifactDir, { recursive: true });
  return artifactDir;
}

export async function readSessionMemory(args: {
  sessionDir: string;
  sessionId: string;
}): Promise<SessionMemory | undefined> {
  const path = getSessionMemoryPath(args.sessionDir, args.sessionId);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = normalizeSessionMemory(JSON.parse(raw) as unknown);
    if (!parsed) {
      return undefined;
    }
    if (parsed.sessionId !== args.sessionId) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export async function writeSessionMemory(args: {
  sessionDir: string;
  sessionId: string;
  memory: SessionMemory;
}): Promise<string> {
  await ensureArtifactDir(args.sessionDir);
  const path = getSessionMemoryPath(args.sessionDir, args.sessionId);
  const payload = `${JSON.stringify(args.memory, null, 2)}\n`;
  await writeFile(path, payload, "utf8");
  return path;
}

export async function upsertSessionMemoryOperatorNotes(args: {
  sessionDir: string;
  sessionId: string;
  sessionFile?: string;
  operatorNotes: string | undefined;
}): Promise<{ memory: SessionMemory; path: string }> {
  const existing = await readSessionMemory({
    sessionDir: args.sessionDir,
    sessionId: args.sessionId,
  });

  const base =
    existing ?? createEmptyMemory({ sessionId: args.sessionId, sessionFile: args.sessionFile });
  const next: SessionMemory = {
    ...base,
    ...(args.sessionFile ? { sessionFile: args.sessionFile } : {}),
    updatedAt: new Date().toISOString(),
    ...(args.operatorNotes ? { operatorNotes: args.operatorNotes } : {}),
  };

  if (!args.operatorNotes) {
    delete next.operatorNotes;
  }

  const path = await writeSessionMemory({
    sessionDir: args.sessionDir,
    sessionId: args.sessionId,
    memory: next,
  });

  return { memory: next, path };
}

export async function upsertSessionMemoryCompaction(args: {
  sessionDir: string;
  sessionId: string;
  sessionFile?: string;
  compaction: SessionMemoryCompactionRecord;
  latestLoopResult?: SessionMemoryLoopResultSnapshot;
  maxHistory?: number;
}): Promise<{ memory: SessionMemory; path: string }> {
  const existing = await readSessionMemory({
    sessionDir: args.sessionDir,
    sessionId: args.sessionId,
  });
  const base =
    existing ?? createEmptyMemory({ sessionId: args.sessionId, sessionFile: args.sessionFile });
  const maxHistory = args.maxHistory ?? DEFAULT_MAX_COMPACTION_HISTORY;
  const nextCompactions = [...base.compactions, args.compaction].slice(-Math.max(1, maxHistory));

  const next: SessionMemory = {
    ...base,
    ...(args.sessionFile ? { sessionFile: args.sessionFile } : {}),
    updatedAt: new Date().toISOString(),
    compactions: nextCompactions,
    ...(args.latestLoopResult === undefined ? {} : { latestLoopResult: args.latestLoopResult }),
  };

  const path = await writeSessionMemory({
    sessionDir: args.sessionDir,
    sessionId: args.sessionId,
    memory: next,
  });

  return { memory: next, path };
}
