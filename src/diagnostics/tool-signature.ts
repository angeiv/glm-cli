import { createHash } from "node:crypto";
import { stat, readFile } from "node:fs/promises";
import { createBuiltinTools, createPlanTools } from "../tools/index.js";
import { getMcpMetadataCachePath, resolveMcpConfigPath } from "../mcp/config.js";

type ToolSummary = {
  name: string;
  description?: string;
  parameters?: unknown;
};

export type RuntimeToolSignature = {
  hash: string;
  builtinTools: string[];
  customTools: string[];
  mcp: {
    disabled: boolean;
    configPath: string;
    configHash?: string;
    configMtimeMs?: number;
    cachePath: string;
    cacheHash?: string;
    cacheMtimeMs?: number;
  };
  lastChangeMs?: number;
};

function stableStringify(value: unknown): string {
  const seen = new Set<unknown>();

  const encode = (input: unknown): string => {
    if (input === null) return "null";
    const t = typeof input;
    if (t === "string") return JSON.stringify(input);
    if (t === "number" || t === "boolean") return JSON.stringify(input);

    if (Array.isArray(input)) {
      return `[${input.map((item) => encode(item)).join(",")}]`;
    }

    if (t === "object") {
      if (seen.has(input)) {
        // Cycles should never appear in the tool definitions we hash, but
        // guard anyway to keep hashing safe.
        return JSON.stringify("[Circular]");
      }
      seen.add(input);
      const obj = input as Record<string, unknown>;
      const keys = Object.keys(obj)
        .filter((key) => obj[key] !== undefined)
        .sort();
      const body = keys.map((key) => `${JSON.stringify(key)}:${encode(obj[key])}`).join(",");
      return `{${body}}`;
    }

    // Unsupported values (undefined, function, symbol, bigint) should not appear
    // in our summaries. Still encode them deterministically.
    return JSON.stringify(String(input));
  };

  return encode(value);
}

function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

function summarizeTools(tools: Array<unknown>): ToolSummary[] {
  const summaries: ToolSummary[] = [];

  for (const tool of tools) {
    if (!tool || typeof tool !== "object") continue;
    const maybe = tool as Record<string, unknown>;
    const name = typeof maybe.name === "string" ? maybe.name : undefined;
    if (!name) continue;

    summaries.push({
      name,
      ...(typeof maybe.description === "string" ? { description: maybe.description } : {}),
      ...(Object.hasOwn(maybe, "parameters") ? { parameters: maybe.parameters } : {}),
    });
  }

  return summaries;
}

async function readStableJsonHash(path: string): Promise<{ hash?: string; mtimeMs?: number }> {
  try {
    const [raw, stats] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    const trimmed = raw.trim();
    if (!trimmed) {
      return { hash: sha256Hex(""), mtimeMs: stats.mtimeMs };
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return {
        hash: sha256Hex(stableStringify(parsed)),
        mtimeMs: stats.mtimeMs,
      };
    } catch {
      // If the file is not valid JSON, fall back to hashing the raw content.
      return { hash: sha256Hex(trimmed), mtimeMs: stats.mtimeMs };
    }
  } catch {
    return {};
  }
}

export async function computeRuntimeToolSignature(args: {
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Promise<RuntimeToolSignature> {
  const builtinTools = createBuiltinTools(args.cwd);
  const customTools = createPlanTools();

  const builtinSummaries = summarizeTools(builtinTools);
  const customSummaries = summarizeTools(customTools);

  const mcpDisabled = args.env.GLM_MCP_DISABLED?.trim() === "1";
  const mcpConfigPath = resolveMcpConfigPath(args.env);
  const mcpCachePath = getMcpMetadataCachePath(args.env);
  const [{ hash: configHash, mtimeMs: configMtimeMs }, { hash: cacheHash, mtimeMs: cacheMtimeMs }] =
    await Promise.all([readStableJsonHash(mcpConfigPath), readStableJsonHash(mcpCachePath)]);

  const lastChangeMs = [configMtimeMs, cacheMtimeMs]
    .filter((v): v is number => typeof v === "number")
    .reduce((acc, next) => Math.max(acc, next), 0);

  const signatureInput = {
    builtinTools: builtinSummaries,
    customTools: customSummaries,
    mcp: {
      disabled: mcpDisabled,
      configHash: configHash ?? null,
      cacheHash: cacheHash ?? null,
    },
  };

  return {
    hash: sha256Hex(stableStringify(signatureInput)),
    builtinTools: builtinSummaries.map((tool) => tool.name),
    customTools: customSummaries.map((tool) => tool.name),
    mcp: {
      disabled: mcpDisabled,
      configPath: mcpConfigPath,
      ...(configHash ? { configHash } : {}),
      ...(configMtimeMs === undefined ? {} : { configMtimeMs }),
      cachePath: mcpCachePath,
      ...(cacheHash ? { cacheHash } : {}),
      ...(cacheMtimeMs === undefined ? {} : { cacheMtimeMs }),
    },
    ...(lastChangeMs > 0 ? { lastChangeMs } : {}),
  };
}
