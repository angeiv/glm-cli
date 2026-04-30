import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { defineTool } from "@mariozechner/pi-coding-agent";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { appendRuntimeEvent } from "../shared/runtime-state.js";
import {
  getMcpMetadataCachePath,
  resolveMcpConfigPath,
  resolveMcpToolMode,
  type McpToolMode,
} from "../../../src/mcp/config.js";

export { getMcpMetadataCachePath, resolveMcpConfigPath };

type McpServerTransportType = "stdio" | "streamable-http" | "sse";

type McpServerConfig = {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  disabled?: boolean;
  timeoutMs?: number;
  url?: string;
  headers?: Record<string, string>;
  toolMode?: string;
  cacheMaxAgeMs?: number;
};

type ResolvedMcpServerConfigBase = {
  disabled: boolean;
  timeoutMs: number;
  toolMode: McpToolMode;
  cacheMaxAgeMs: number;
};

type ResolvedStdioMcpServerConfig = ResolvedMcpServerConfigBase & {
  type: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
};

type ResolvedRemoteMcpServerConfig = ResolvedMcpServerConfigBase & {
  type: "streamable-http" | "sse";
  url: string;
  headers?: Record<string, string>;
};

export type ResolvedMcpServerConfig =
  | ResolvedStdioMcpServerConfig
  | ResolvedRemoteMcpServerConfig;

type McpRequestInit = {
  headers?: Record<string, string>;
};

type McpConfigFile = {
  mcpServers?: Record<string, McpServerConfig>;
  servers?: Record<string, McpServerConfig>;
};

type LoadedMcpTool = {
  serverName: string;
  toolName: string;
  tool: {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  };
};

type LoadedServer = {
  name: string;
  config: ResolvedMcpServerConfig;
  client: any;
  transport: any;
  tools: LoadedMcpTool[];
};

type CachedMcpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type McpMetadataCacheEntry = {
  configHash: string;
  cachedAt: number;
  tools: CachedMcpTool[];
};

export type McpMetadataCache = {
  version: number;
  servers: Record<string, McpMetadataCacheEntry>;
};

type McpRegistrationPlan = {
  eagerConnect: boolean;
  registerDirectTools: boolean;
  registerProxyTool: boolean;
};

const MCP_CACHE_VERSION = 1;
const DEFAULT_MCP_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MCP_STATUS_KEY = "mcp";

function safeId(input: string): string {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return "server";
  return normalized.replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}

export function buildMcpToolName(serverName: string, toolName: string): string {
  return `mcp__${safeId(serverName)}__${safeId(toolName)}`;
}

export function buildMcpProxyToolName(serverName: string): string {
  return `mcp__${safeId(serverName)}__proxy`;
}

function setUiStatus(
  ctx: { hasUI: boolean; ui: { setStatus(key: string, text: string | undefined): void } } | undefined,
  text: string | undefined,
): void {
  if (!ctx?.hasUI) return;
  try {
    ctx.ui.setStatus(MCP_STATUS_KEY, text);
  } catch {
    // Never allow UI status updates to crash tool execution.
  }
}

function normalizeMcpConfig(value: unknown): McpConfigFile {
  if (!value || typeof value !== "object") return {};

  const maybe = value as Record<string, unknown>;
  const mcpServers =
    typeof maybe.mcpServers === "object" && maybe.mcpServers && !Array.isArray(maybe.mcpServers)
      ? (maybe.mcpServers as Record<string, McpServerConfig>)
      : undefined;
  const servers =
    typeof maybe.servers === "object" && maybe.servers && !Array.isArray(maybe.servers)
      ? (maybe.servers as Record<string, McpServerConfig>)
      : undefined;

  return { mcpServers, servers };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String);
}

function normalizeStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value)
    .filter(([, item]) => typeof item === "string")
    .map(([key, item]) => [key, item]);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function resolveTransportType(
  type: unknown,
  hasCommand: boolean,
): McpServerTransportType | undefined {
  if (typeof type !== "string" || !type.trim()) {
    return hasCommand ? "stdio" : undefined;
  }

  const normalized = type.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (normalized === "stdio") return "stdio";
  if (normalized === "http" || normalized === "streamable-http" || normalized === "streamablehttp") {
    return "streamable-http";
  }
  if (normalized === "sse") return "sse";

  throw new Error(`Unsupported MCP transport type: ${type}`);
}

function resolvePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.trunc(value);
}

export function readMcpConfig(path: string): McpConfigFile {
  try {
    const raw = readFileSync(path, "utf8");
    return normalizeMcpConfig(JSON.parse(raw));
  } catch {
    return {};
  }
}

function asServerMap(config: McpConfigFile): Record<string, McpServerConfig> {
  return config.mcpServers ?? config.servers ?? {};
}

export function resolveMcpServerConfig(value: unknown): ResolvedMcpServerConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid MCP server config");
  }

  const maybe = value as Record<string, unknown>;
  const command = typeof maybe.command === "string" ? maybe.command.trim() : "";
  const url = typeof maybe.url === "string" ? maybe.url.trim() : "";
  const type = resolveTransportType(maybe.type, command.length > 0);
  const timeoutMs = resolvePositiveInteger(maybe.timeoutMs, 10_000);
  const disabled = maybe.disabled === true;
  const toolMode = resolveMcpToolMode(maybe.toolMode, { strict: true });
  const cacheMaxAgeMs = resolvePositiveInteger(maybe.cacheMaxAgeMs, DEFAULT_MCP_CACHE_MAX_AGE_MS);

  if (!type) {
    throw new Error("MCP server config must define a stdio command or supported transport type");
  }

  if (type === "stdio") {
    if (!command) {
      throw new Error("MCP stdio server requires command");
    }

    return {
      type,
      command,
      args: normalizeStringArray(maybe.args),
      ...(normalizeStringRecord(maybe.env) ? { env: normalizeStringRecord(maybe.env) } : {}),
      ...(typeof maybe.cwd === "string" && maybe.cwd.trim() ? { cwd: maybe.cwd.trim() } : {}),
      disabled,
      timeoutMs,
      toolMode,
      cacheMaxAgeMs,
    };
  }

  if (!url) {
    throw new Error(`MCP ${type} server requires url`);
  }

  return {
    type,
    url,
    ...(normalizeStringRecord(maybe.headers)
      ? { headers: normalizeStringRecord(maybe.headers) }
      : {}),
    disabled,
    timeoutMs,
    toolMode,
    cacheMaxAgeMs,
  };
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? "undefined" : serialized;
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function computeMcpServerConfigHash(config: ResolvedMcpServerConfig): string {
  const identity =
    config.type === "stdio"
      ? {
          type: config.type,
          command: config.command,
          args: config.args,
          env: config.env,
          cwd: config.cwd,
        }
      : {
          type: config.type,
          url: config.url,
          headers: config.headers,
        };

  return createHash("sha256").update(stableStringify(identity)).digest("hex");
}

export function loadMcpMetadataCache(path: string): McpMetadataCache | null {
  if (!existsSync(path)) {
    return null;
  }

  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!raw || typeof raw !== "object") {
      return null;
    }
    if (raw.version !== MCP_CACHE_VERSION) {
      return null;
    }
    if (!raw.servers || typeof raw.servers !== "object") {
      return null;
    }
    return raw as McpMetadataCache;
  } catch {
    return null;
  }
}

export function saveMcpMetadataCache(
  path: string,
  cache: McpMetadataCache,
  configs?: Record<string, ResolvedMcpServerConfig>,
): void {
  mkdirSync(dirname(path), { recursive: true });

  let merged: McpMetadataCache = { version: MCP_CACHE_VERSION, servers: {} };
  try {
    const existing = loadMcpMetadataCache(path);
    if (existing) {
      merged = existing;
    }
  } catch {
    // Ignore parse failures and overwrite.
  }

  const nextServers: Record<string, McpMetadataCacheEntry> = { ...merged.servers };
  for (const [serverName, entry] of Object.entries(cache.servers ?? {})) {
    nextServers[serverName] = {
      configHash: configs?.[serverName]
        ? computeMcpServerConfigHash(configs[serverName])
        : entry.configHash,
      cachedAt:
        typeof entry.cachedAt === "number" && Number.isFinite(entry.cachedAt)
          ? entry.cachedAt
          : Date.now(),
      tools: Array.isArray(entry.tools)
        ? entry.tools
            .filter((tool) => tool && typeof tool.name === "string" && tool.name.trim())
            .map((tool) => ({
              name: tool.name,
              ...(tool.description ? { description: tool.description } : {}),
              ...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
            }))
        : [],
    };
  }

  const payload: McpMetadataCache = {
    version: MCP_CACHE_VERSION,
    servers: nextServers,
  };

  const tmpPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2), "utf8");
  renameSync(tmpPath, path);
}

export function isMcpMetadataCacheEntryValid(
  entry: McpMetadataCacheEntry | null | undefined,
  config: ResolvedMcpServerConfig,
): boolean {
  if (!entry) {
    return false;
  }
  if (entry.configHash !== computeMcpServerConfigHash(config)) {
    return false;
  }
  if (!Number.isFinite(entry.cachedAt) || entry.cachedAt <= 0) {
    return false;
  }
  if (config.cacheMaxAgeMs > 0 && Date.now() - entry.cachedAt > config.cacheMaxAgeMs) {
    return false;
  }
  return Array.isArray(entry.tools);
}

function buildCachedLoadedTools(serverName: string, tools: CachedMcpTool[]): LoadedMcpTool[] {
  return tools
    .filter((tool) => typeof tool?.name === "string" && tool.name.trim().length > 0)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((tool) => ({
      serverName,
      toolName: tool.name,
      tool: {
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        ...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
      },
    }));
}

function serializeLoadedTools(tools: LoadedMcpTool[]): CachedMcpTool[] {
  return tools.map((tool) => ({
    name: tool.toolName,
    ...(tool.tool.description ? { description: tool.tool.description } : {}),
    ...(tool.tool.inputSchema ? { inputSchema: tool.tool.inputSchema } : {}),
  }));
}

function getValidCachedTools(
  cache: McpMetadataCache | null,
  serverName: string,
  config: ResolvedMcpServerConfig,
): LoadedMcpTool[] {
  const entry = cache?.servers?.[serverName];
  if (!isMcpMetadataCacheEntryValid(entry, config)) {
    return [];
  }

  return buildCachedLoadedTools(serverName, entry.tools);
}

export function resolveMcpRegistrationPlan(
  config: ResolvedMcpServerConfig,
  cachedToolCount: number,
): McpRegistrationPlan {
  if (config.toolMode === "proxy") {
    return {
      eagerConnect: false,
      registerDirectTools: false,
      registerProxyTool: true,
    };
  }

  if (config.toolMode === "hybrid") {
    return {
      eagerConnect: false,
      registerDirectTools: cachedToolCount > 0,
      registerProxyTool: cachedToolCount === 0,
    };
  }

  return {
    eagerConnect: false,
    registerDirectTools: cachedToolCount > 0,
    registerProxyTool: cachedToolCount === 0,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms: ${label}`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    );
  });
}

function asToolResultContent(
  content: unknown,
): Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> {
  if (!Array.isArray(content)) {
    return [{ type: "text", text: String(content ?? "") }];
  }

  const mapped: Array<
    { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
  > = [];

  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const maybe = item as Record<string, unknown>;
    const type = String(maybe.type ?? "");

    if (type === "text") {
      mapped.push({ type: "text", text: String(maybe.text ?? "") });
      continue;
    }

    if (type === "image") {
      mapped.push({
        type: "image",
        data: String(maybe.data ?? ""),
        mimeType: String(maybe.mimeType ?? "application/octet-stream"),
      });
    }
  }

  return mapped.length > 0 ? mapped : [{ type: "text", text: "" }];
}

function formatProxyToolDescription(serverName: string, tools: LoadedMcpTool[]): string {
  const lines = [
    `Proxy access for MCP server ${serverName}.`,
    "Use action=list to inspect available tools, or action=call to invoke a tool by name.",
  ];

  if (tools.length > 0) {
    const visible = tools.slice(0, 12).map((tool) => tool.toolName);
    lines.push(`Known tools: ${visible.join(", ")}${tools.length > visible.length ? ", ..." : ""}`);
  } else {
    lines.push("Known tools: none cached yet.");
  }

  return lines.join("\n\n");
}

function formatProxyToolList(serverName: string, tools: LoadedMcpTool[]): string {
  if (tools.length === 0) {
    return `${serverName}: no tools available.`;
  }

  return [
    `${serverName} (${tools.length} tool${tools.length === 1 ? "" : "s"}):`,
    ...tools.map((tool) => `- ${tool.toolName}${tool.tool.description ? `: ${tool.tool.description}` : ""}`),
  ].join("\n");
}

export default async function (pi: ExtensionAPI) {
  if (process.env.GLM_MCP_DISABLED?.trim() === "1") {
    return;
  }

  const configPath = resolveMcpConfigPath(process.env);
  const config = readMcpConfig(configPath);
  const serverEntries = Object.entries(asServerMap(config)).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const cachePath = getMcpMetadataCachePath(process.env);
  let metadataCache = loadMcpMetadataCache(cachePath) ?? {
    version: MCP_CACHE_VERSION,
    servers: {},
  };

  type RegisteredSummary = {
    name: string;
    mode: McpToolMode;
    toolCount: number;
    source: "live" | "cache" | "proxy";
  };

  const resolvedServers = new Map<string, ResolvedMcpServerConfig>();
  for (const [name, rawServer] of serverEntries) {
    try {
      const server = resolveMcpServerConfig(rawServer);
      if (!server.disabled) {
        resolvedServers.set(name, server);
      }
    } catch (error) {
      appendRuntimeEvent({
        type: "mcp.config_invalid",
        level: "warn",
        summary: `${name}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const connectionPromises = new Map<string, Promise<LoadedServer>>();
  const registeredSummaries = new Map<string, RegisteredSummary>();
  const directToolNamesByServer = new Map<string, Set<string>>();
  const connectionStates = new Map<string, "connecting" | "connected" | "failed">();
  let uiCtx:
    | { hasUI: boolean; ui: { setStatus(key: string, text: string | undefined): void } }
    | undefined;

  function buildStatusLine(): string | undefined {
    const total = resolvedServers.size;
    if (total === 0) {
      return undefined;
    }

    const counts = { live: 0, cache: 0, proxy: 0 };
    for (const summary of registeredSummaries.values()) {
      counts[summary.source] += 1;
    }

    return `MCP: ${total} server${total === 1 ? "" : "s"} | live ${counts.live} | cached ${counts.cache} | proxy ${counts.proxy}`;
  }

  function refreshStatus(): void {
    setUiStatus(uiCtx, buildStatusLine());
  }

  function connectingStatus(serverName: string, config: ResolvedMcpServerConfig): string {
    const transport =
      config.type === "stdio"
        ? "stdio"
        : config.type === "streamable-http"
          ? "http"
          : "sse";
    return `MCP: connecting ${serverName} (${transport})...`;
  }

  async function connectServer(
    serverName: string,
    ctx?: { hasUI: boolean; ui: { setStatus(key: string, text: string | undefined): void } },
  ): Promise<LoadedServer> {
    const existing = connectionPromises.get(serverName);
    const state = connectionStates.get(serverName);
    if (ctx?.hasUI) {
      uiCtx = ctx;
    }
    if (state === "connecting") {
      const config = resolvedServers.get(serverName);
      if (config) {
        setUiStatus(uiCtx, connectingStatus(serverName, config));
      }
    } else if (state === "connected") {
      refreshStatus();
    }
    if (existing) {
      return existing;
    }

    const config = resolvedServers.get(serverName);
    if (!config) {
      throw new Error(`Unknown MCP server: ${serverName}`);
    }

    connectionStates.set(serverName, "connecting");
    setUiStatus(uiCtx, connectingStatus(serverName, config));
    appendRuntimeEvent({
      type: "mcp.connecting",
      summary: `${serverName}: connecting`,
    });

    const promise = (async () => {
      const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
      const { StdioClientTransport } = await import(
        "@modelcontextprotocol/sdk/client/stdio.js"
      );
      const { StreamableHTTPClientTransport } = await import(
        "@modelcontextprotocol/sdk/client/streamableHttp.js"
      );
      const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");

      let transport: any;
      if (config.type === "stdio") {
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          ...(config.env ? { env: { ...process.env, ...config.env } } : { env: process.env }),
          ...(config.cwd ? { cwd: config.cwd } : {}),
        });
      } else {
        const requestInit: McpRequestInit | undefined = config.headers
          ? { headers: config.headers }
          : undefined;
        const url = new URL(config.url);
        transport =
          config.type === "streamable-http"
            ? new StreamableHTTPClientTransport(url, requestInit ? { requestInit } : undefined)
            : new SSEClientTransport(url, requestInit ? { requestInit } : undefined);
      }

      const client = new Client(
        { name: "glm", version: "0.0.0" },
        {
          capabilities: {},
        },
      );

      try {
        await withTimeout(client.connect(transport), config.timeoutMs, `mcp connect ${serverName}`);
        const listResult = await withTimeout(
          client.listTools(),
          config.timeoutMs,
          `mcp listTools ${serverName}`,
        );
        const tools = (listResult?.tools ?? []) as Array<{
          name: string;
          description?: string;
          inputSchema?: Record<string, unknown>;
        }>;

        const loaded: LoadedServer = {
          name: serverName,
          config,
          client,
          transport,
          tools: tools
            .filter((tool) => typeof tool?.name === "string" && tool.name.trim().length > 0)
            .sort((left, right) => left.name.localeCompare(right.name))
            .map((tool) => ({
              serverName,
              toolName: tool.name,
              tool,
            })),
        };

        metadataCache = {
          ...metadataCache,
          servers: {
            ...metadataCache.servers,
            [serverName]: {
              configHash: computeMcpServerConfigHash(config),
              cachedAt: Date.now(),
              tools: serializeLoadedTools(loaded.tools),
            },
          },
        };
        saveMcpMetadataCache(cachePath, metadataCache);

        appendRuntimeEvent({
          type: "mcp.connected",
          summary: `${serverName}: ${loaded.tools.length} tool${loaded.tools.length === 1 ? "" : "s"}`,
        });

        // If this server is configured for direct/hybrid tools, register the freshly
        // discovered tools now so users don't have to reload the session.
        if (config.toolMode !== "proxy") {
          registerDirectTools(serverName, loaded.tools);
        }
        registeredSummaries.set(serverName, {
          name: serverName,
          mode: config.toolMode,
          toolCount: loaded.tools.length,
          source: "live",
        });
        connectionStates.set(serverName, "connected");
        refreshStatus();

        return loaded;
      } catch (error) {
        appendRuntimeEvent({
          type: "mcp.connect_failed",
          level: "error",
          summary: `${serverName}: ${error instanceof Error ? error.message : String(error)}`,
        });
        connectionStates.set(serverName, "failed");
        refreshStatus();
        try {
          await client.close();
        } catch {
          // Ignore.
        }
        try {
          await transport.close?.();
        } catch {
          // Ignore.
        }
        throw error;
      }
    })();

    connectionPromises.set(serverName, promise);
    try {
      return await promise;
    } catch (error) {
      connectionPromises.delete(serverName);
      throw error;
    }
  }

  async function executeToolCall(
    serverName: string,
    toolName: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
    ctx?: { hasUI: boolean; ui: { setStatus(key: string, text: string | undefined): void } },
  ) {
    if (signal?.aborted) {
      throw new Error("Tool execution aborted");
    }

    const server = await connectServer(serverName, ctx);
    const result = (await server.client.callTool({
      name: toolName,
      arguments: params,
    })) as { content?: unknown; isError?: boolean };

    if (result?.isError) {
      const content = asToolResultContent(result.content);
      const message = content
        .filter((entry): entry is { type: "text"; text: string } => entry.type === "text")
        .map((entry) => entry.text)
        .join("\n")
        .trim();
      throw new Error(message || "MCP tool returned an error");
    }

    return {
      content: asToolResultContent(result?.content),
      details: {
        server: serverName,
        tool: toolName,
      },
    };
  }

  function registerDirectTools(serverName: string, tools: LoadedMcpTool[]) {
    if (tools.length === 0) return;
    const registered = directToolNamesByServer.get(serverName) ?? new Set<string>();
    if (!directToolNamesByServer.has(serverName)) {
      directToolNamesByServer.set(serverName, registered);
    }

    for (const tool of tools) {
      if (registered.has(tool.toolName)) continue;
      registerDirectTool(serverName, tool);
      registered.add(tool.toolName);
    }
  }

  function registerDirectTool(serverName: string, tool: LoadedMcpTool) {
    const name = buildMcpToolName(serverName, tool.toolName);
    pi.registerTool(
      defineTool({
        name,
        label: `MCP ${serverName}:${tool.toolName}`,
        description: `${tool.tool.description ?? tool.toolName}\n\nMCP server: ${serverName}`,
        parameters: (tool.tool.inputSchema ?? { type: "object" }) as any,
        execute: async (_toolCallId, params, signal, _onUpdate, ctx) =>
          executeToolCall(
            serverName,
            tool.toolName,
            (params as Record<string, unknown>) ?? {},
            signal,
            ctx,
          ),
      }),
    );
  }

  function registerProxyTool(serverName: string, cachedTools: LoadedMcpTool[]) {
    const name = buildMcpProxyToolName(serverName);
    pi.registerTool(
      defineTool({
        name,
        label: `MCP ${serverName} proxy`,
        description: formatProxyToolDescription(serverName, cachedTools),
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: {
              type: "string",
              enum: ["list", "call"],
            },
            tool: {
              type: "string",
            },
            arguments: {
              type: "object",
              additionalProperties: true,
            },
          },
          required: ["action"],
        } as any,
        execute: async (_toolCallId, params, signal, _onUpdate, ctx) => {
          const action = typeof (params as Record<string, unknown>)?.action === "string"
            ? String((params as Record<string, unknown>).action)
            : "";

          if (action === "list") {
            const tools =
              cachedTools.length > 0
                ? cachedTools
                : (await connectServer(serverName, ctx)).tools;
            return {
              content: [{ type: "text" as const, text: formatProxyToolList(serverName, tools) }],
              details: {
                server: serverName,
                mode: "proxy",
                toolCount: tools.length,
              },
            };
          }

          if (action === "call") {
            const toolName = typeof (params as Record<string, unknown>)?.tool === "string"
              ? String((params as Record<string, unknown>).tool).trim()
              : "";
            if (!toolName) {
              throw new Error("tool is required when action=call");
            }
            const rawArgs = (params as Record<string, unknown>)?.arguments;
            const toolArgs =
              rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
                ? (rawArgs as Record<string, unknown>)
                : {};

            return executeToolCall(serverName, toolName, toolArgs, signal, ctx);
          }

          throw new Error("action must be one of: list, call");
        },
      }),
    );
  }

  for (const [serverName, config] of resolvedServers) {
    const cachedTools = getValidCachedTools(metadataCache, serverName, config);
    const plan = resolveMcpRegistrationPlan(config, cachedTools.length);

    if (plan.registerDirectTools) {
      registerDirectTools(serverName, cachedTools);
      registeredSummaries.set(serverName, {
        name: serverName,
        mode: config.toolMode,
        toolCount: cachedTools.length,
        source: "cache",
      });
      continue;
    }

    if (plan.registerProxyTool) {
      registerProxyTool(serverName, cachedTools);
      registeredSummaries.set(serverName, {
        name: serverName,
        mode: config.toolMode,
        toolCount: cachedTools.length,
        source: "proxy",
      });
    }
  }

  pi.on("session_start", (_event, ctx) => {
    if (ctx.hasUI) {
      uiCtx = ctx;
      refreshStatus();
    }
  });

  pi.registerCommand("mcp", {
    description: "Show MCP server/tool status, or reload extensions.",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (trimmed === "reload") {
        appendRuntimeEvent({
          type: "mcp.reload",
          summary: "MCP runtime reload requested",
        });
        await ctx.reload();
        return;
      }

      const summaries = [...registeredSummaries.values()].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
      const summary =
        summaries.length === 0
          ? "No MCP servers loaded. Create ~/.glm/mcp.json (or set GLM_MCP_CONFIG) to enable."
          : summaries
              .map((server) => {
                const sourceLabel =
                  server.source === "live"
                    ? "live"
                    : server.source === "cache"
                      ? "cached"
                      : "proxy";
                return `${server.name}: ${server.toolCount} tool${server.toolCount === 1 ? "" : "s"} | mode ${server.mode} | ${sourceLabel}`;
              })
              .join("\n");

      if (ctx.hasUI) {
        ctx.ui.notify(summary, "info");
      } else {
        pi.sendMessage(
          { customType: "mcp", content: summary, display: true, details: {} },
          { triggerTurn: false, deliverAs: "nextTurn" },
        );
      }
    },
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (ctx.hasUI) {
      setUiStatus(ctx, undefined);
    }
    uiCtx = undefined;

    for (const promise of connectionPromises.values()) {
      try {
        const server = await promise;
        try {
          await server.client.close();
        } catch {
          // Ignore.
        }
        try {
          await server.transport.close?.();
        } catch {
          // Ignore.
        }
      } catch {
        // Ignore failed lazy connections.
      }
    }
  });
}
