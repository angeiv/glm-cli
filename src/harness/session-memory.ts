import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type SessionMemoryCompactionRecord = {
  entryId: string;
  at: string;
  summary: string;
  tokensBefore: number;
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

export type SessionMemory = SessionMemoryV1;

const SESSION_MEMORY_KIND = "glm.sessionMemory";
const SESSION_MEMORY_VERSION = 1;
const DEFAULT_MAX_COMPACTION_HISTORY = 20;

export function getSessionMemoryPath(sessionDir: string, sessionId: string): string {
  return join(sessionDir, "artifacts", `memory-${sessionId}.json`);
}

function isSessionMemory(value: unknown): value is SessionMemory {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<SessionMemory>;
  if (maybe.kind !== SESSION_MEMORY_KIND) return false;
  if (maybe.version !== SESSION_MEMORY_VERSION) return false;
  if (typeof maybe.sessionId !== "string" || !maybe.sessionId.trim()) return false;
  if (typeof maybe.updatedAt !== "string" || !maybe.updatedAt.trim()) return false;
  if (!Array.isArray(maybe.compactions)) return false;

  for (const record of maybe.compactions) {
    if (!record || typeof record !== "object") return false;
    const rec = record as Partial<SessionMemoryCompactionRecord>;
    if (typeof rec.entryId !== "string" || !rec.entryId.trim()) return false;
    if (typeof rec.at !== "string" || !rec.at.trim()) return false;
    if (typeof rec.summary !== "string") return false;
    if (typeof rec.tokensBefore !== "number") return false;
  }

  if (maybe.operatorNotes !== undefined && typeof maybe.operatorNotes !== "string") {
    return false;
  }

  if (maybe.sessionFile !== undefined && typeof maybe.sessionFile !== "string") {
    return false;
  }

  return true;
}

function createEmptyMemory(args: {
  sessionId: string;
  sessionFile?: string;
}): SessionMemory {
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
    const parsed = JSON.parse(raw) as unknown;
    if (!isSessionMemory(parsed)) {
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
    existing ??
    createEmptyMemory({ sessionId: args.sessionId, sessionFile: args.sessionFile });
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
  maxHistory?: number;
}): Promise<{ memory: SessionMemory; path: string }> {
  const existing = await readSessionMemory({
    sessionDir: args.sessionDir,
    sessionId: args.sessionId,
  });
  const base =
    existing ??
    createEmptyMemory({ sessionId: args.sessionId, sessionFile: args.sessionFile });
  const maxHistory = args.maxHistory ?? DEFAULT_MAX_COMPACTION_HISTORY;
  const nextCompactions = [...base.compactions, args.compaction].slice(
    -Math.max(1, maxHistory),
  );

  const next: SessionMemory = {
    ...base,
    ...(args.sessionFile ? { sessionFile: args.sessionFile } : {}),
    updatedAt: new Date().toISOString(),
    compactions: nextCompactions,
  };

  const path = await writeSessionMemory({
    sessionDir: args.sessionDir,
    sessionId: args.sessionId,
    memory: next,
  });

  return { memory: next, path };
}

