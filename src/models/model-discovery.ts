import * as fsPromises from "node:fs/promises";
import { dirname, join } from "node:path";
import { getGlmAgentDir } from "../app/dirs.js";
import type { ApiKind } from "../providers/types.js";
import { isOfficialProvider } from "../providers/types.js";
import type {
  DiscoveredModelMetadata,
  EffectiveModelCaps,
  GlmInputModality,
} from "./model-profile-types.js";

export type ModelDiscoveryConfig = {
  enabled?: boolean;
  cacheTtlMs?: number;
  allowStaleOnError?: boolean;
  requestTimeoutMs?: number;
};

export type DiscoveredModel = DiscoveredModelMetadata;

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
  requestTimeoutMs: 2500,
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
  return normalizeNonEmptyString(value);
}

function toPositiveInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}

function normalizeInputModality(value: unknown): GlmInputModality | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "text" || normalized === "image" || normalized === "video") {
    return normalized;
  }
  return undefined;
}

function normalizeInputModalities(values: unknown[]): GlmInputModality[] | undefined {
  const modalities: GlmInputModality[] = [];
  for (const value of values) {
    const modality = normalizeInputModality(value);
    if (!modality || modalities.includes(modality)) continue;
    modalities.push(modality);
  }
  return modalities.length > 0 ? modalities : undefined;
}

function parseModalitiesFromArchitecture(value: unknown): GlmInputModality[] | undefined {
  if (typeof value !== "string") return undefined;
  const [input] = value.split("->", 1);
  if (!input) return undefined;
  return normalizeInputModalities(
    input
      .split("+")
      .map((segment) => segment.trim())
      .filter(Boolean),
  );
}

function parseInputModalities(item: Record<string, unknown>): GlmInputModality[] | undefined {
  const direct =
    (Array.isArray(item.input_modalities) && normalizeInputModalities(item.input_modalities)) ||
    (Array.isArray(item.modalities) && normalizeInputModalities(item.modalities));
  if (direct) return direct;

  const architecture =
    item.architecture && typeof item.architecture === "object"
      ? (item.architecture as Record<string, unknown>)
      : undefined;
  if (!architecture) return undefined;

  return (
    (Array.isArray(architecture.input_modalities) &&
      normalizeInputModalities(architecture.input_modalities)) ||
    parseModalitiesFromArchitecture(architecture.modality)
  );
}

function normalizeSupportedParameters(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeNonEmptyString(entry)?.toLowerCase())
    .filter((entry): entry is string => Boolean(entry));
}

function parseCapabilityBooleans(item: Record<string, unknown>): Partial<EffectiveModelCaps> {
  const caps: Partial<EffectiveModelCaps> = {};
  const supportedParameters = normalizeSupportedParameters(
    item.supported_parameters ?? item.supportedParameters,
  );

  const capabilityHints =
    item.capabilities && typeof item.capabilities === "object"
      ? (item.capabilities as Record<string, unknown>)
      : undefined;

  const hasParameter = (...values: string[]) =>
    values.some((value) => supportedParameters.includes(value));
  const hasCapability = (...values: string[]) =>
    values.some((value) => capabilityHints?.[value] === true);

  if (
    hasCapability("reasoning", "thinking", "supports_reasoning", "supportsThinking") ||
    hasParameter(
      "reasoning",
      "include_reasoning",
      "thinking",
      "reasoning_effort",
      "thinking_budget",
    )
  ) {
    caps.supportsThinking = true;
    caps.defaultThinkingMode = "enabled";
  }

  if (
    hasCapability("tools", "tool_call", "toolCall", "function_call", "functionCall") ||
    hasParameter("tools", "tool_choice", "functions", "function_call")
  ) {
    caps.supportsToolCall = true;
  }

  if (
    hasCapability("structured_outputs", "structuredOutput", "response_format", "responseFormat") ||
    hasParameter("response_format", "structured_outputs", "json_schema", "json_object")
  ) {
    caps.supportsStructuredOutput = true;
  }

  if (
    hasCapability("cache", "prompt_cache", "promptCache", "cache_control") ||
    hasParameter("cache_control", "prompt_cache", "input_cache")
  ) {
    caps.supportsCache = true;
  }

  if (hasCapability("tool_stream", "toolStream") || hasParameter("tool_stream")) {
    caps.supportsToolStream = true;
  }

  return caps;
}

function mergeCaps(
  left: Partial<EffectiveModelCaps> | undefined,
  right: Partial<EffectiveModelCaps> | undefined,
): Partial<EffectiveModelCaps> | undefined {
  if (!left && !right) return undefined;
  return {
    ...(left ?? {}),
    ...(right ?? {}),
  };
}

function mergeDiscoveredModel(
  left: DiscoveredModel | undefined,
  right: DiscoveredModel,
): DiscoveredModel {
  if (!left) {
    return right;
  }

  return {
    id: left.id,
    name: right.name ?? left.name,
    modalities: right.modalities ?? left.modalities,
    caps: mergeCaps(left.caps, right.caps),
  };
}

function parseDiscoveredModel(item: unknown): DiscoveredModel | undefined {
  if (typeof item === "string") {
    const id = normalizeModelId(item);
    return id ? { id } : undefined;
  }

  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return undefined;
  }

  const maybe = item as Record<string, unknown>;
  const id = normalizeModelId(maybe.id ?? maybe.model);
  if (!id) return undefined;

  const topProvider =
    maybe.top_provider && typeof maybe.top_provider === "object"
      ? (maybe.top_provider as Record<string, unknown>)
      : undefined;
  const directCaps =
    maybe.caps && typeof maybe.caps === "object" && !Array.isArray(maybe.caps)
      ? (maybe.caps as Partial<EffectiveModelCaps>)
      : undefined;
  const contextWindow =
    toPositiveInteger(maybe.contextWindow) ??
    toPositiveInteger(maybe.context_window) ??
    toPositiveInteger(maybe.context_length) ??
    toPositiveInteger(maybe.max_context_tokens) ??
    toPositiveInteger(topProvider?.contextWindow) ??
    toPositiveInteger(topProvider?.context_window) ??
    toPositiveInteger(topProvider?.context_length);
  const maxOutputTokens =
    toPositiveInteger(maybe.maxTokens) ??
    toPositiveInteger(maybe.max_output_tokens) ??
    toPositiveInteger(maybe.max_completion_tokens) ??
    toPositiveInteger(topProvider?.maxTokens) ??
    toPositiveInteger(topProvider?.max_output_tokens) ??
    toPositiveInteger(topProvider?.max_completion_tokens);

  const caps: Partial<EffectiveModelCaps> = {
    ...(directCaps ?? {}),
    ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    ...parseCapabilityBooleans(maybe),
  };
  const modalities =
    (Array.isArray(maybe.modalities) && normalizeInputModalities(maybe.modalities)) ||
    parseInputModalities(maybe);

  return {
    id,
    ...(normalizeNonEmptyString(maybe.name ?? maybe.display_name ?? maybe.displayName)
      ? {
          name: normalizeNonEmptyString(maybe.name ?? maybe.display_name ?? maybe.displayName),
        }
      : {}),
    ...(Object.keys(caps).length > 0 ? { caps } : {}),
    ...(modalities ? { modalities } : {}),
  };
}

function dedupeAndSortModels(models: DiscoveredModel[]): DiscoveredModel[] {
  const byId = new Map<string, DiscoveredModel>();

  for (const model of models) {
    const id = normalizeModelId(model.id);
    if (!id) continue;
    byId.set(id, mergeDiscoveredModel(byId.get(id), { ...model, id }));
  }

  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
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
    list
      .map((item) => parseDiscoveredModel(item))
      .filter((item): item is DiscoveredModel => Boolean(item)),
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
      if (!value || typeof value !== "object") continue;
      const provider = normalizeNonEmptyString((value as { provider?: unknown }).provider);
      const api = normalizeNonEmptyString((value as { api?: unknown }).api) as ApiKind | undefined;
      const baseUrl = normalizeNonEmptyString((value as { baseUrl?: unknown }).baseUrl);
      const fetchedAt = normalizeNonEmptyString((value as { fetchedAt?: unknown }).fetchedAt);
      if (!provider || !api || !baseUrl || !fetchedAt) continue;

      entries[key] = {
        provider,
        api,
        baseUrl,
        fetchedAt,
        models: parseDiscoveredModelsPayload((value as { models?: unknown }).models ?? []),
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

function supportsDiscovery(provider: string, api: ApiKind): boolean {
  return api !== "anthropic" && !isOfficialProvider(provider);
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
  await writeFile(cachePath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
}

function normalizeConfig(config?: ModelDiscoveryConfig): Required<ModelDiscoveryConfig> {
  const rawEnabled = (config as { enabled?: unknown } | undefined)?.enabled;
  const rawCacheTtlMs = (config as { cacheTtlMs?: unknown } | undefined)?.cacheTtlMs;
  const rawAllowStaleOnError = (config as { allowStaleOnError?: unknown } | undefined)
    ?.allowStaleOnError;
  const rawRequestTimeoutMs = (config as { requestTimeoutMs?: unknown } | undefined)
    ?.requestTimeoutMs;

  return {
    enabled: typeof rawEnabled === "boolean" ? rawEnabled : DEFAULT_MODEL_DISCOVERY_CONFIG.enabled,
    cacheTtlMs:
      typeof rawCacheTtlMs === "number" && Number.isInteger(rawCacheTtlMs) && rawCacheTtlMs > 0
        ? rawCacheTtlMs
        : DEFAULT_MODEL_DISCOVERY_CONFIG.cacheTtlMs,
    allowStaleOnError:
      typeof rawAllowStaleOnError === "boolean"
        ? rawAllowStaleOnError
        : DEFAULT_MODEL_DISCOVERY_CONFIG.allowStaleOnError,
    requestTimeoutMs:
      typeof rawRequestTimeoutMs === "number" &&
      Number.isInteger(rawRequestTimeoutMs) &&
      rawRequestTimeoutMs > 0
        ? rawRequestTimeoutMs
        : DEFAULT_MODEL_DISCOVERY_CONFIG.requestTimeoutMs,
  };
}

function setRuntimeStatus(status: ModelDiscoveryStatus): void {
  getRuntimeStateStore().set(status.cacheKey, status);
}

function trimTerminalApiPath(url: URL): URL {
  const trimmed = url.pathname.replace(/\/+$/g, "");
  const suffixes = ["/chat/completions", "/responses", "/completions", "/models"];
  for (const suffix of suffixes) {
    if (!trimmed.endsWith(suffix)) continue;
    url.pathname = trimmed.slice(0, -suffix.length) || "/";
    return url;
  }
  url.pathname = trimmed || "/";
  return url;
}

function buildModelsEndpoint(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  trimTerminalApiPath(parsed);
  parsed.pathname = `${parsed.pathname.replace(/\/+$/g, "")}/models`;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function tryBuildModelsEndpoint(baseUrl: string): string | undefined {
  try {
    return buildModelsEndpoint(baseUrl);
  } catch {
    return undefined;
  }
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
      ? tryBuildModelsEndpoint(args.baseUrl)
      : undefined,
  };
}

async function fetchModels(
  args: ResolveDiscoveredModelsInput,
  deps?: ModelDiscoveryDeps,
): Promise<DiscoveredModel[]> {
  const { fetch: fetchImpl } = getDeps(deps);
  const config = normalizeConfig(args.config);
  const endpoint = tryBuildModelsEndpoint(args.baseUrl);
  if (!endpoint) {
    throw new Error(`Invalid base URL for model discovery: ${args.baseUrl}`);
  }
  const response = await fetchImpl(endpoint, {
    method: "GET",
    headers: {
      accept: "application/json",
      ...(args.apiKey ? { authorization: `Bearer ${args.apiKey}` } : {}),
    },
    signal: AbortSignal.timeout(config.requestTimeoutMs),
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
