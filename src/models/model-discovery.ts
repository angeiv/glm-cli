import * as fsPromises from "node:fs/promises";
import { dirname, join } from "node:path";
import { getGlmAgentDir } from "../app/dirs.js";
import type { ApiKind } from "../providers/types.js";

export type ModelDiscoveryConfig = {
  enabled?: boolean;
  cacheTtlMs?: number;
  allowStaleOnError?: boolean;
};

export type DiscoveredModel = {
  id: string;
};

export type ModelDiscoverySource =
  | "disabled"
  | "unsupported"
  | "live"
  | "cache-fresh"
  | "cache-stale"
  | "miss"
  | "fallback";

export type ModelDiscoveryStatus = {
  enabled: boolean;
  supported: boolean;
  cachePath: string;
  cacheKey: string;
  source: ModelDiscoverySource;
  endpoint?: string;
  modelCount?: number;
  fetchedAt?: string;
  stale?: boolean;
  error?: string;
};

export type ResolveDiscoveredModelsInput = {
  provider: string;
  api: ApiKind;
  baseUrl: string;
  apiKey?: string;
  cachePath?: string;
  config?: ModelDiscoveryConfig;
};

type CacheEntry = {
  provider: string;
  api: ApiKind;
  baseUrl: string;
  fetchedAt: string;
  models: DiscoveredModel[];
};

type CacheFile = {
  version: 1;
  entries: Record<string, CacheEntry>;
};

type ModelDiscoveryDeps = {
  readFile?: typeof fsPromises.readFile;
  writeFile?: typeof fsPromises.writeFile;
  mkdir?: typeof fsPromises.mkdir;
  fetch?: typeof fetch;
  now?: () => number;
};

const DEFAULT_MODEL_DISCOVERY_CONFIG: Required<ModelDiscoveryConfig> = {
  enabled: true,
  cacheTtlMs: 60 * 60 * 1000,
  allowStaleOnError: true,
};

const MODEL_DISCOVERY_RUNTIME_STATE = Symbol.for("glm.modelDiscovery");

function getRuntimeStateStore(): Map<string, ModelDiscoveryStatus> {
  const root = globalThis as Record<PropertyKey, unknown>;
  const existing = root[MODEL_DISCOVERY_RUNTIME_STATE];
  if (existing instanceof Map) {
    return existing as Map<string, ModelDiscoveryStatus>;
  }

  const store = new Map<string, ModelDiscoveryStatus>();
  root[MODEL_DISCOVERY_RUNTIME_STATE] = store;
  return store;
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/g, "").toLowerCase();
}

function normalizeModelId(value: unknown): string | undefined {
  const normalized = normalizeNonEmptyString(value);
  return normalized ? normalized : undefined;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function buildModelsEndpoint(baseUrl: string): string {
  return new URL("models", ensureTrailingSlash(baseUrl)).toString();
}

function dedupeAndSortModels(models: DiscoveredModel[]): DiscoveredModel[] {
  const ids = new Set<string>();
  const result: DiscoveredModel[] = [];

  for (const model of models) {
    const id = normalizeModelId(model.id);
    if (!id || ids.has(id)) continue;
    ids.add(id);
    result.push({ id });
  }

  return result.sort((left, right) => left.id.localeCompare(right.id));
}

function parseDiscoveredModelsPayload(payload: unknown): DiscoveredModel[] {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown[] } | undefined)?.data)
      ? ((payload as { data: unknown[] }).data ?? [])
      : Array.isArray((payload as { models?: unknown[] } | undefined)?.models)
        ? ((payload as { models: unknown[] }).models ?? [])
        : [];

  return dedupeAndSortModels(
    list.map((item) => ({
      id:
        normalizeModelId((item as { id?: unknown } | undefined)?.id) ??
        normalizeModelId(item) ??
        "",
    })),
  );
}

function parseCacheFile(raw: string): CacheFile | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<CacheFile>;
    if (parsed.version !== 1 || typeof parsed.entries !== "object" || parsed.entries === null) {
      return undefined;
    }

    const entries: Record<string, CacheEntry> = {};
    for (const [key, value] of Object.entries(parsed.entries)) {
      if (typeof value !== "object" || value === null) continue;
      const provider = normalizeNonEmptyString((value as { provider?: unknown }).provider);
      const api = normalizeNonEmptyString((value as { api?: unknown }).api) as ApiKind | undefined;
      const baseUrl = normalizeNonEmptyString((value as { baseUrl?: unknown }).baseUrl);
      const fetchedAt = normalizeNonEmptyString((value as { fetchedAt?: unknown }).fetchedAt);
      const models = parseDiscoveredModelsPayload((value as { models?: unknown }).models ?? []);
      if (!provider || !api || !baseUrl || !fetchedAt) continue;
      entries[key] = {
        provider,
        api,
        baseUrl,
        fetchedAt,
        models,
      };
    }

    return {
      version: 1,
      entries,
    };
  } catch {
    return undefined;
  }
}

function isFresh(entry: CacheEntry, ttlMs: number, now: number): boolean {
  const fetchedAt = Date.parse(entry.fetchedAt);
  if (!Number.isFinite(fetchedAt)) return false;
  return now - fetchedAt <= ttlMs;
}

function isSupportedApi(api: ApiKind): boolean {
  return api === "openai-compatible" || api === "openai-responses";
}

function isNativeOfficialProvider(provider: string): boolean {
  return (
    provider === "bigmodel" ||
    provider === "bigmodel-coding" ||
    provider === "zai" ||
    provider === "zai-coding"
  );
}

function supportsDiscovery(provider: string, api: ApiKind): boolean {
  return isSupportedApi(api) && !isNativeOfficialProvider(provider);
}

function getDeps(deps?: ModelDiscoveryDeps) {
  return {
    readFile: deps?.readFile ?? fsPromises.readFile,
    writeFile: deps?.writeFile ?? fsPromises.writeFile,
    mkdir: deps?.mkdir ?? fsPromises.mkdir,
    fetch: deps?.fetch ?? fetch,
    now: deps?.now ?? Date.now,
  };
}

async function readCacheFile(
  cachePath: string,
  deps?: ModelDiscoveryDeps,
): Promise<CacheFile | undefined> {
  const { readFile } = getDeps(deps);

  try {
    const raw = await readFile(cachePath, "utf8");
    return parseCacheFile(raw);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return undefined;
    }
    return undefined;
  }
}

async function writeCacheEntry(
  cachePath: string,
  cacheKey: string,
  entry: CacheEntry,
  deps?: ModelDiscoveryDeps,
): Promise<void> {
  const { mkdir, writeFile } = getDeps(deps);
  const current = (await readCacheFile(cachePath, deps)) ?? {
    version: 1 as const,
    entries: {},
  };

  current.entries[cacheKey] = entry;
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(current, null, 2), "utf8");
}

function normalizeConfig(config?: ModelDiscoveryConfig): Required<ModelDiscoveryConfig> {
  const rawEnabled = (config as { enabled?: unknown } | undefined)?.enabled;
  const rawCacheTtlMs = (config as { cacheTtlMs?: unknown } | undefined)?.cacheTtlMs;
  const rawAllowStaleOnError = (config as { allowStaleOnError?: unknown } | undefined)
    ?.allowStaleOnError;

  return {
    enabled: typeof rawEnabled === "boolean" ? rawEnabled : DEFAULT_MODEL_DISCOVERY_CONFIG.enabled,
    cacheTtlMs:
      typeof rawCacheTtlMs === "number" ? rawCacheTtlMs : DEFAULT_MODEL_DISCOVERY_CONFIG.cacheTtlMs,
    allowStaleOnError:
      typeof rawAllowStaleOnError === "boolean"
        ? rawAllowStaleOnError
        : DEFAULT_MODEL_DISCOVERY_CONFIG.allowStaleOnError,
  };
}

function setRuntimeStatus(status: ModelDiscoveryStatus): void {
  getRuntimeStateStore().set(status.cacheKey, status);
}

function buildBaseStatus(args: {
  provider: string;
  api: ApiKind;
  baseUrl: string;
  cachePath: string;
  config: Required<ModelDiscoveryConfig>;
}): ModelDiscoveryStatus {
  return {
    enabled: args.config.enabled,
    supported: supportsDiscovery(args.provider, args.api),
    cachePath: args.cachePath,
    cacheKey: buildModelDiscoveryCacheKey(args.provider, args.api, args.baseUrl),
    source: !args.config.enabled
      ? "disabled"
      : supportsDiscovery(args.provider, args.api)
        ? "miss"
        : "unsupported",
    endpoint: supportsDiscovery(args.provider, args.api)
      ? buildModelsEndpoint(args.baseUrl)
      : undefined,
  };
}

async function fetchModels(
  args: ResolveDiscoveredModelsInput,
  deps?: ModelDiscoveryDeps,
): Promise<DiscoveredModel[]> {
  const { fetch: fetchImpl } = getDeps(deps);
  const endpoint = buildModelsEndpoint(args.baseUrl);
  const response = await fetchImpl(endpoint, {
    method: "GET",
    headers: {
      accept: "application/json",
      ...(args.apiKey ? { authorization: `Bearer ${args.apiKey}` } : {}),
    },
  });
  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(`${response.status} ${rawText || "request failed"}`.trim());
  }

  const parsed = rawText ? JSON.parse(rawText) : { data: [] };
  return parseDiscoveredModelsPayload(parsed);
}

export function getDefaultModelDiscoveryConfig(): Required<ModelDiscoveryConfig> {
  return { ...DEFAULT_MODEL_DISCOVERY_CONFIG };
}

export function cloneModelDiscoveryConfig(
  config?: ModelDiscoveryConfig,
): Required<ModelDiscoveryConfig> {
  return normalizeConfig(config);
}

export function validateModelDiscoveryConfig(config: ModelDiscoveryConfig): void {
  const rawEnabled = (config as { enabled?: unknown }).enabled;
  const rawCacheTtlMs = (config as { cacheTtlMs?: unknown }).cacheTtlMs;
  const rawAllowStaleOnError = (config as { allowStaleOnError?: unknown }).allowStaleOnError;

  if (rawEnabled !== undefined && typeof rawEnabled !== "boolean") {
    throw new Error(`Invalid modelDiscovery.enabled in config file: ${typeof rawEnabled}`);
  }

  if (
    rawCacheTtlMs !== undefined &&
    (!Number.isInteger(rawCacheTtlMs) || (rawCacheTtlMs as number) <= 0)
  ) {
    throw new Error(`Invalid modelDiscovery.cacheTtlMs in config file: ${String(rawCacheTtlMs)}`);
  }

  if (rawAllowStaleOnError !== undefined && typeof rawAllowStaleOnError !== "boolean") {
    throw new Error(
      `Invalid modelDiscovery.allowStaleOnError in config file: ${typeof rawAllowStaleOnError}`,
    );
  }
}

export function resolveDiscoveryCachePath(agentDir = getGlmAgentDir()): string {
  return join(agentDir, "discovered-models.json");
}

export function buildModelDiscoveryCacheKey(
  provider: string,
  api: ApiKind,
  baseUrl: string,
): string {
  return `${provider.trim().toLowerCase()}::${api}::${normalizeBaseUrl(baseUrl)}`;
}

export function clearModelDiscoveryRuntimeState(): void {
  getRuntimeStateStore().clear();
}

export async function resolveDiscoveredModels(
  args: ResolveDiscoveredModelsInput,
  deps?: ModelDiscoveryDeps,
): Promise<{
  models: DiscoveredModel[];
  status: ModelDiscoveryStatus;
}> {
  const config = normalizeConfig(args.config);
  const cachePath = args.cachePath ?? resolveDiscoveryCachePath();
  const baseStatus = buildBaseStatus({
    provider: args.provider,
    api: args.api,
    baseUrl: args.baseUrl,
    cachePath,
    config,
  });

  if (!config.enabled || !baseStatus.supported) {
    setRuntimeStatus(baseStatus);
    return {
      models: [],
      status: baseStatus,
    };
  }

  const cache = await readCacheFile(cachePath, deps);
  const cacheEntry = cache?.entries[baseStatus.cacheKey];
  const now = getDeps(deps).now();

  if (cacheEntry && isFresh(cacheEntry, config.cacheTtlMs, now)) {
    const status = {
      ...baseStatus,
      source: "cache-fresh" as const,
      modelCount: cacheEntry.models.length,
      fetchedAt: cacheEntry.fetchedAt,
    };
    setRuntimeStatus(status);
    return {
      models: cacheEntry.models,
      status,
    };
  }

  try {
    const models = await fetchModels(args, deps);
    const fetchedAt = new Date(now).toISOString();
    await writeCacheEntry(
      cachePath,
      baseStatus.cacheKey,
      {
        provider: args.provider,
        api: args.api,
        baseUrl: args.baseUrl,
        fetchedAt,
        models,
      },
      deps,
    );
    const status = {
      ...baseStatus,
      source: "live" as const,
      modelCount: models.length,
      fetchedAt,
    };
    setRuntimeStatus(status);
    return {
      models,
      status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (cacheEntry && config.allowStaleOnError) {
      const status = {
        ...baseStatus,
        source: "cache-stale" as const,
        modelCount: cacheEntry.models.length,
        fetchedAt: cacheEntry.fetchedAt,
        stale: true,
        error: message,
      };
      setRuntimeStatus(status);
      return {
        models: cacheEntry.models,
        status,
      };
    }

    const status = {
      ...baseStatus,
      source: "fallback" as const,
      error: message,
    };
    setRuntimeStatus(status);
    return {
      models: [],
      status,
    };
  }
}

export async function resolveModelDiscoveryStatus(args: {
  provider: string;
  api: ApiKind;
  baseUrl: string;
  cachePath?: string;
  config?: ModelDiscoveryConfig;
}): Promise<ModelDiscoveryStatus> {
  const config = normalizeConfig(args.config);
  const cachePath = args.cachePath ?? resolveDiscoveryCachePath();
  const baseStatus = buildBaseStatus({
    provider: args.provider,
    api: args.api,
    baseUrl: args.baseUrl,
    cachePath,
    config,
  });

  if (!config.enabled || !baseStatus.supported) {
    return baseStatus;
  }

  const runtimeStatus = getRuntimeStateStore().get(baseStatus.cacheKey);
  if (runtimeStatus) {
    return runtimeStatus;
  }

  const cache = await readCacheFile(cachePath);
  const entry = cache?.entries[baseStatus.cacheKey];
  if (!entry) {
    return baseStatus;
  }

  const fresh = isFresh(entry, config.cacheTtlMs, Date.now());
  return {
    ...baseStatus,
    source: fresh ? "cache-fresh" : "cache-stale",
    modelCount: entry.models.length,
    fetchedAt: entry.fetchedAt,
    ...(fresh ? {} : { stale: true }),
  };
}
