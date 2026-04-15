import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { defineTool } from "@mariozechner/pi-coding-agent";
import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
};

type ResolvedStdioMcpServerConfig = {
  type: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  disabled: boolean;
  timeoutMs: number;
};

type ResolvedRemoteMcpServerConfig = {
  type: "streamable-http" | "sse";
  url: string;
  headers?: Record<string, string>;
  disabled: boolean;
  timeoutMs: number;
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

function safeId(input: string): string {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return "server";
  return normalized.replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}

export function buildMcpToolName(serverName: string, toolName: string): string {
  return `mcp__${safeId(serverName)}__${safeId(toolName)}`;
}

export function resolveMcpConfigPath(env: NodeJS.ProcessEnv): string {
  const raw = env.GLM_MCP_CONFIG?.trim();
  if (raw) {
    if (raw.startsWith("~/")) {
      return join(homedir(), raw.slice(2));
    }
    return raw;
  }

  return join(homedir(), ".glm", "mcp.json");
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
  const timeoutMs =
    typeof maybe.timeoutMs === "number" && Number.isFinite(maybe.timeoutMs) && maybe.timeoutMs > 0
      ? maybe.timeoutMs
      : 10_000;
  const disabled = maybe.disabled === true;

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

async function loadMcpServers(): Promise<LoadedServer[]> {
  const configPath = resolveMcpConfigPath(process.env);
  const config = readMcpConfig(configPath);
  const servers = asServerMap(config);
  const entries = Object.entries(servers);
  if (entries.length === 0) return [];

  // Lazy import so glm can run even if users don't use MCP.
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/stdio.js"
  );
  const { StreamableHTTPClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/streamableHttp.js"
  );
  const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");

  const loaded: LoadedServer[] = [];

  for (const [name, rawServer] of entries) {
    let server: ResolvedMcpServerConfig;
    try {
      server = resolveMcpServerConfig(rawServer);
    } catch {
      continue;
    }

    if (server.disabled) continue;

    let transport: any;
    if (server.type === "stdio") {
      transport = new StdioClientTransport({
        command: server.command,
        args: server.args,
        ...(server.env ? { env: { ...process.env, ...server.env } } : { env: process.env }),
        ...(server.cwd ? { cwd: server.cwd } : {}),
      });
    } else {
      const requestInit: McpRequestInit | undefined = server.headers
        ? { headers: server.headers }
        : undefined;
      const url = new URL(server.url);
      transport =
        server.type === "streamable-http"
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
      await withTimeout(client.connect(transport), server.timeoutMs, `mcp connect ${name}`);
      const listResult = await withTimeout(
        client.listTools(),
        server.timeoutMs,
        `mcp listTools ${name}`,
      );
      const tools = (listResult?.tools ?? []) as Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
      }>;

      loaded.push({
        name,
        config: server,
        client,
        transport,
        tools: tools
          .filter((t) => typeof t?.name === "string" && t.name.trim().length > 0)
          .map((tool) => ({
            serverName: name,
            toolName: tool.name,
            tool,
          })),
      });
    } catch {
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
    }
  }

  return loaded;
}

function asToolResultContent(content: unknown): Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> {
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

export default async function (pi: ExtensionAPI) {
  if (process.env.GLM_MCP_DISABLED?.trim() === "1") {
    return;
  }

  const loadedServers = await loadMcpServers();
  const toolsByName = new Map<string, LoadedMcpTool & { server: LoadedServer }>();

  for (const server of loadedServers) {
    for (const tool of server.tools) {
      const name = buildMcpToolName(tool.serverName, tool.toolName);
      if (toolsByName.has(name)) continue;
      toolsByName.set(name, { ...tool, server });

      pi.registerTool(
        defineTool({
          name,
          label: `MCP ${tool.serverName}:${tool.toolName}`,
          description: `${tool.tool.description ?? tool.toolName}\n\nMCP server: ${tool.serverName}`,
          parameters: (tool.tool.inputSchema ?? { type: "object" }) as any,
          execute: async (_toolCallId, params, signal, _onUpdate, ctx) => {
            if (signal?.aborted) {
              throw new Error("Tool execution aborted");
            }

            const entry = toolsByName.get(name);
            if (!entry) {
              throw new Error(`MCP tool unavailable: ${name}`);
            }

            const result = (await entry.server.client.callTool({
              name: entry.toolName,
              arguments: params as Record<string, unknown>,
            })) as { content?: unknown; isError?: boolean };

            if (result?.isError) {
              const content = asToolResultContent(result.content);
              const message = content
                .filter((c): c is { type: "text"; text: string } => c.type === "text")
                .map((c) => c.text)
                .join("\n")
                .trim();
              throw new Error(message || "MCP tool returned an error");
            }

            return {
              content: asToolResultContent(result?.content),
              details: {
                server: entry.server.name,
                tool: entry.toolName,
              },
            };
          },
        }),
      );
    }
  }

  pi.registerCommand("mcp", {
    description: "Show MCP server/tool status, or reload extensions.",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (trimmed === "reload") {
        await ctx.reload();
        return;
      }

      const summary =
        loadedServers.length === 0
          ? "No MCP servers loaded. Create ~/.glm/mcp.json (or set GLM_MCP_CONFIG) to enable."
          : loadedServers
              .map((server) => {
                const toolCount = server.tools.length;
                return `${server.name}: ${toolCount} tool${toolCount === 1 ? "" : "s"}`;
              })
              .join("\n");

      if (ctx.hasUI) {
        ctx.ui.notify(summary, "info");
      } else {
        // Print/pipe mode: emit as a normal message for visibility.
        pi.sendMessage(
          { customType: "mcp", content: summary, display: true, details: {} },
          { triggerTurn: false, deliverAs: "nextTurn" },
        );
      }
    },
  });

  pi.on("session_shutdown", async () => {
    for (const server of loadedServers) {
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
    }
  });
}
