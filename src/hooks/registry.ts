import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HookEventName, HookFile, HookRule } from "./types.js";

export const DEFAULT_HOOKS_PATH = join(homedir(), ".glm", "hooks.json");

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isHookEventName(value: string | undefined): value is HookEventName {
  return (
    value === "sessionStart" ||
    value === "beforeTool" ||
    value === "afterTool" ||
    value === "permissionRequest" ||
    value === "beforeProviderRequest" ||
    value === "sessionEnd"
  );
}

function parseHookRule(value: unknown): HookRule {
  const record = normalizeRecord(value);
  if (!record) {
    throw new Error("Hook rule must be an object");
  }

  const event = normalizeString(record.event);
  if (!isHookEventName(event)) {
    throw new Error(`Invalid hook event: ${String(record.event)}`);
  }

  const id = normalizeString(record.id);
  const timeoutMsRaw = (record as { timeoutMs?: unknown }).timeoutMs;
  const timeoutMs =
    typeof timeoutMsRaw === "number" && Number.isInteger(timeoutMsRaw) && timeoutMsRaw > 0
      ? timeoutMsRaw
      : timeoutMsRaw === undefined
        ? undefined
        : (timeoutMsRaw as number);

  if (
    timeoutMsRaw !== undefined &&
    (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs <= 0)
  ) {
    throw new Error(`Invalid hook timeoutMs: ${String(timeoutMsRaw)}`);
  }

  const matchRaw = (record as { match?: unknown }).match;
  const matchRecord = matchRaw === undefined ? undefined : normalizeRecord(matchRaw);
  if (matchRaw !== undefined && !matchRecord) {
    throw new Error("Hook match must be an object");
  }

  const match = matchRecord
    ? {
        tool: normalizeString(matchRecord.tool),
        commandPrefix: normalizeString(matchRecord.commandPrefix),
        provider: normalizeString(matchRecord.provider),
        model: normalizeString(matchRecord.model),
        reason: normalizeString(matchRecord.reason),
      }
    : undefined;

  const handlerRaw = (record as { handler?: unknown }).handler;
  const handlerRecord = normalizeRecord(handlerRaw);
  if (!handlerRecord) {
    throw new Error("Hook handler must be an object");
  }

  const backend = normalizeString(handlerRecord.backend);
  if (backend !== "command" && backend !== "http") {
    throw new Error(`Invalid hook backend: ${String(handlerRecord.backend)}`);
  }

  if (backend === "command") {
    const command = normalizeString(handlerRecord.command);
    if (!command) {
      throw new Error("Command hook requires handler.command");
    }
    return {
      ...(id ? { id } : {}),
      event,
      ...(match ? { match } : {}),
      handler: { backend: "command", command },
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    };
  }

  const url = normalizeString(handlerRecord.url);
  if (!url) {
    throw new Error("HTTP hook requires handler.url");
  }

  const methodRaw = normalizeString(handlerRecord.method)?.toUpperCase();
  const method =
    methodRaw === "GET" || methodRaw === "POST" ? (methodRaw as "GET" | "POST") : undefined;
  if (methodRaw !== undefined && method === undefined) {
    throw new Error(`Invalid hook http method: ${String(handlerRecord.method)}`);
  }

  const headersRaw = (handlerRecord as { headers?: unknown }).headers;
  const headersRecord = headersRaw === undefined ? undefined : normalizeRecord(headersRaw);
  if (headersRaw !== undefined && !headersRecord) {
    throw new Error("Hook http headers must be an object");
  }

  const headers: Record<string, string> | undefined = headersRecord
    ? Object.fromEntries(Object.entries(headersRecord).map(([key, value]) => [key, String(value)]))
    : undefined;

  return {
    ...(id ? { id } : {}),
    event,
    ...(match ? { match } : {}),
    handler: {
      backend: "http",
      url,
      ...(method ? { method } : {}),
      ...(headers ? { headers } : {}),
    },
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  };
}

export function parseHookFile(value: unknown): HookFile {
  const record = normalizeRecord(value);
  if (!record) {
    throw new Error("hooks.json must be an object");
  }

  const hooksRaw = (record as { hooks?: unknown }).hooks;
  if (Array.isArray(hooksRaw)) {
    return {
      ...(typeof record.version === "number" ? { version: record.version } : {}),
      hooks: hooksRaw.map(parseHookRule),
    };
  }

  const hooks: HookRule[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (key === "version") continue;
    if (!isHookEventName(key)) {
      throw new Error(`Unknown hook event group: ${key}`);
    }
    if (!Array.isArray(value)) {
      throw new Error(`Hook event group "${key}" must be an array`);
    }
    for (const ruleRaw of value) {
      const rule = parseHookRule({ ...(normalizeRecord(ruleRaw) ?? {}), event: key });
      hooks.push(rule);
    }
  }

  return { ...(typeof record.version === "number" ? { version: record.version } : {}), hooks };
}

export async function readHookFile(path = DEFAULT_HOOKS_PATH): Promise<HookFile | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return parseHookFile(parsed);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}
