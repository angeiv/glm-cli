import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeCompactionStatus, RuntimeSettingsSource } from "./types.js";

const DEFAULT_COMPACTION = {
  enabled: true,
  reserveTokens: 16_384,
  keepRecentTokens: 20_000,
} as const;

type CompactionSettingsInput = {
  enabled?: unknown;
  reserveTokens?: unknown;
  keepRecentTokens?: unknown;
};

type SettingsFile = {
  compaction?: CompactionSettingsInput;
};

function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  return undefined;
}

function coercePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  if (!Number.isFinite(value)) return undefined;
  const normalized = Math.floor(value);
  if (normalized <= 0) return undefined;
  return normalized;
}

function extractCompactionSettings(parsed: SettingsFile | undefined): {
  enabled?: boolean;
  reserveTokens?: number;
  keepRecentTokens?: number;
} {
  const compaction = parsed?.compaction;
  if (!compaction || typeof compaction !== "object") {
    return {};
  }

  return {
    enabled: coerceBoolean((compaction as CompactionSettingsInput).enabled),
    reserveTokens: coercePositiveInteger(
      (compaction as CompactionSettingsInput).reserveTokens,
    ),
    keepRecentTokens: coercePositiveInteger(
      (compaction as CompactionSettingsInput).keepRecentTokens,
    ),
  };
}

async function readSettingsFile(path: string): Promise<{
  parsed?: SettingsFile;
  error?: string;
}> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return { parsed: parsed as SettingsFile };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // ENOENT is expected when the user hasn't created settings.json yet.
    if (message.includes("ENOENT")) {
      return {};
    }
    return { error: message };
  }
}

function summarizeSources(sources: RuntimeCompactionStatus["sources"]): RuntimeSettingsSource | "mixed" {
  const values = new Set(Object.values(sources));
  return values.size === 1 ? (values.values().next().value as RuntimeSettingsSource) : "mixed";
}

export function formatCompactionSource(source: RuntimeSettingsSource | "mixed"): string {
  if (source === "default") return "default";
  if (source === "global") return "global";
  if (source === "project") return "project";
  return "mixed";
}

export async function resolveRuntimeCompactionStatus(args: {
  agentDir: string;
  cwd: string;
}): Promise<RuntimeCompactionStatus & { sourceSummary: RuntimeSettingsSource | "mixed" }> {
  const globalPath = join(args.agentDir, "settings.json");
  const projectPath = join(args.cwd, ".glm", "settings.json");

  const [globalSettings, projectSettings] = await Promise.all([
    readSettingsFile(globalPath),
    readSettingsFile(projectPath),
  ]);

  const globalCompaction = extractCompactionSettings(globalSettings.parsed);
  const projectCompaction = extractCompactionSettings(projectSettings.parsed);

  const enabled =
    projectCompaction.enabled ??
    globalCompaction.enabled ??
    DEFAULT_COMPACTION.enabled;
  const reserveTokens =
    projectCompaction.reserveTokens ??
    globalCompaction.reserveTokens ??
    DEFAULT_COMPACTION.reserveTokens;
  const keepRecentTokens =
    projectCompaction.keepRecentTokens ??
    globalCompaction.keepRecentTokens ??
    DEFAULT_COMPACTION.keepRecentTokens;

  const sources = {
    enabled:
      projectCompaction.enabled !== undefined
        ? "project"
        : globalCompaction.enabled !== undefined
          ? "global"
          : "default",
    reserveTokens:
      projectCompaction.reserveTokens !== undefined
        ? "project"
        : globalCompaction.reserveTokens !== undefined
          ? "global"
          : "default",
    keepRecentTokens:
      projectCompaction.keepRecentTokens !== undefined
        ? "project"
        : globalCompaction.keepRecentTokens !== undefined
          ? "global"
          : "default",
  } satisfies RuntimeCompactionStatus["sources"];

  const errors = {
    ...(globalSettings.error ? { global: globalSettings.error } : {}),
    ...(projectSettings.error ? { project: projectSettings.error } : {}),
  };

  const status: RuntimeCompactionStatus = {
    enabled,
    reserveTokens,
    keepRecentTokens,
    settingsPaths: {
      global: globalPath,
      project: projectPath,
    },
    sources,
    ...(Object.keys(errors).length ? { errors } : {}),
  };

  return {
    ...status,
    sourceSummary: summarizeSources(sources),
  };
}
