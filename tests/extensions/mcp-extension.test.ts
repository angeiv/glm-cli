import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  default as registerMcpExtension,
  buildMcpToolName,
  buildMcpProxyToolName,
  getMcpMetadataCachePath,
  loadMcpMetadataCache,
  saveMcpMetadataCache,
  isMcpMetadataCacheEntryValid,
  resolveMcpRegistrationPlan,
  readMcpConfig,
  resolveMcpServerConfig,
  resolveMcpConfigPath,
} from "../../resources/extensions/glm-mcp/index.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("glm-mcp extension helpers", () => {
  test("buildMcpToolName namespaces and normalizes identifiers", () => {
    expect(buildMcpToolName("Brave Search", "web.search")).toBe("mcp__brave_search__web_search");
    expect(buildMcpToolName("  Z.ai  ", "ZhipuAI/GLM-5")).toBe("mcp__z_ai__zhipuai_glm-5");
  });

  test("buildMcpProxyToolName namespaces proxy tools per server", () => {
    expect(buildMcpProxyToolName("Brave Search")).toBe("mcp__brave_search__proxy");
  });

  test("resolveMcpConfigPath defaults to ~/.glm/mcp.json", () => {
    const path = resolveMcpConfigPath({});
    expect(path.endsWith(join(".glm", "mcp.json"))).toBe(true);
  });

  test("resolveMcpConfigPath expands ~/ prefix", () => {
    const path = resolveMcpConfigPath({ GLM_MCP_CONFIG: "~/demo/mcp.json" });
    expect(path.includes(join("demo", "mcp.json"))).toBe(true);
    expect(path.startsWith("~")).toBe(false);
  });

  test("readMcpConfig supports mcpServers and servers keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "glm-mcp-"));
    const path = join(dir, "mcp.json");
    writeFileSync(
      path,
      JSON.stringify(
        {
          mcpServers: {
            "brave-search": { command: "npx", args: ["-y", "server"], env: { KEY: "x" } },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const parsed = readMcpConfig(path);
    expect(parsed.mcpServers?.["brave-search"]?.command).toBe("npx");

    const path2 = join(dir, "mcp2.json");
    writeFileSync(
      path2,
      JSON.stringify({ servers: { foo: { command: "node" } } }, null, 2),
      "utf8",
    );
    const parsed2 = readMcpConfig(path2);
    expect(parsed2.servers?.foo?.command).toBe("node");
  });

  test("readMcpConfig preserves remote MCP fields", () => {
    const dir = mkdtempSync(join(tmpdir(), "glm-mcp-"));
    const path = join(dir, "mcp-remote.json");
    writeFileSync(
      path,
      JSON.stringify(
        {
          mcpServers: {
            search: {
              type: "streamable-http",
              url: "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
              headers: {
                Authorization: "Bearer token",
              },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const parsed = readMcpConfig(path);
    expect(parsed.mcpServers?.search?.type).toBe("streamable-http");
    expect(parsed.mcpServers?.search?.url).toBe(
      "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
    );
    expect(parsed.mcpServers?.search?.headers?.Authorization).toBe("Bearer token");
  });

  test("resolveMcpServerConfig infers stdio from command-only config", () => {
    expect(resolveMcpServerConfig({ command: "npx" })).toMatchObject({
      type: "stdio",
      command: "npx",
      args: [],
      timeoutMs: 10_000,
    });
  });

  test("resolveMcpServerConfig normalizes http aliases to streamable-http", () => {
    expect(
      resolveMcpServerConfig({
        type: "http",
        url: "https://open.bigmodel.cn/api/mcp/web_reader/mcp",
      }),
    ).toMatchObject({
      type: "streamable-http",
      url: "https://open.bigmodel.cn/api/mcp/web_reader/mcp",
    });

    expect(
      resolveMcpServerConfig({
        type: "streamableHttp",
        url: "https://open.bigmodel.cn/api/mcp/web_reader/mcp",
      }),
    ).toMatchObject({
      type: "streamable-http",
      url: "https://open.bigmodel.cn/api/mcp/web_reader/mcp",
    });
  });

  test("resolveMcpServerConfig preserves sse transport", () => {
    expect(
      resolveMcpServerConfig({
        type: "sse",
        url: "https://open.bigmodel.cn/api/mcp/zread/mcp",
      }),
    ).toMatchObject({
      type: "sse",
      url: "https://open.bigmodel.cn/api/mcp/zread/mcp",
    });
  });

  test("resolveMcpServerConfig supports MCP adapter tool modes", () => {
    expect(
      resolveMcpServerConfig({
        command: "npx",
        toolMode: "proxy",
      }),
    ).toMatchObject({
      type: "stdio",
      toolMode: "proxy",
    });

    expect(
      resolveMcpServerConfig({
        command: "npx",
        toolMode: "hybrid",
      }),
    ).toMatchObject({
      type: "stdio",
      toolMode: "hybrid",
    });
  });

  test("resolveMcpServerConfig rejects unknown tool modes", () => {
    expect(() =>
      resolveMcpServerConfig({
        command: "npx",
        toolMode: "weird",
      }),
    ).toThrow(/tool mode/i);
  });

  test("getMcpMetadataCachePath defaults under ~/.glm/agent", () => {
    const path = getMcpMetadataCachePath({});
    expect(path.endsWith(join(".glm", "agent", "mcp-cache.json"))).toBe(true);
  });

  test("metadata cache entries are invalidated when the server identity changes", () => {
    const dir = mkdtempSync(join(tmpdir(), "glm-mcp-cache-"));
    const cachePath = join(dir, "mcp-cache.json");
    const resolved = resolveMcpServerConfig({
      command: "npx",
      args: ["-y", "@z_ai/mcp-server"],
      toolMode: "hybrid",
    });

    saveMcpMetadataCache(
      cachePath,
      {
        version: 1,
        servers: {
          vision: {
            configHash: "placeholder",
            cachedAt: Date.now(),
            tools: [
              {
                name: "vision_analyze",
                description: "Analyze an image",
                inputSchema: { type: "object" },
              },
            ],
          },
        },
      },
      {
        vision: resolved,
      },
    );

    const cache = loadMcpMetadataCache(cachePath);
    expect(cache?.servers.vision?.tools).toHaveLength(1);
    expect(isMcpMetadataCacheEntryValid(cache?.servers.vision, resolved)).toBe(true);

    const changed = resolveMcpServerConfig({
      command: "npx",
      args: ["-y", "@z_ai/mcp-server", "--alt"],
      toolMode: "hybrid",
    });
    expect(isMcpMetadataCacheEntryValid(cache?.servers.vision, changed)).toBe(false);
  });

  test("resolveMcpRegistrationPlan chooses lazy direct, proxy, and cached hybrid modes", () => {
    const direct = resolveMcpServerConfig({ command: "npx", toolMode: "direct" });
    const proxy = resolveMcpServerConfig({ command: "npx", toolMode: "proxy" });
    const hybrid = resolveMcpServerConfig({ command: "npx", toolMode: "hybrid" });

    expect(resolveMcpRegistrationPlan(direct, 0)).toMatchObject({
      eagerConnect: false,
      registerDirectTools: false,
      registerProxyTool: true,
    });
    expect(resolveMcpRegistrationPlan(proxy, 0)).toMatchObject({
      eagerConnect: false,
      registerDirectTools: false,
      registerProxyTool: true,
    });
    expect(resolveMcpRegistrationPlan(hybrid, 3)).toMatchObject({
      eagerConnect: false,
      registerDirectTools: true,
      registerProxyTool: false,
    });
    expect(resolveMcpRegistrationPlan(hybrid, 0)).toMatchObject({
      eagerConnect: false,
      registerDirectTools: false,
      registerProxyTool: true,
    });
  });

  test("resolveMcpServerConfig rejects remote configs without url", () => {
    expect(() => resolveMcpServerConfig({ type: "streamable-http" })).toThrow(/url/i);
  });

  test("registers a proxy tool and uses cached metadata for list in proxy mode", async () => {
    const dir = mkdtempSync(join(tmpdir(), "glm-mcp-runtime-"));
    const configPath = join(dir, "mcp.json");
    const cachePath = join(dir, "mcp-cache.json");

    writeFileSync(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            search: {
              command: "npx",
              toolMode: "proxy",
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const searchConfig = resolveMcpServerConfig({
      command: "npx",
      toolMode: "proxy",
    });
    saveMcpMetadataCache(
      cachePath,
      {
        version: 1,
        servers: {
          search: {
            configHash: "placeholder",
            cachedAt: Date.now(),
            tools: [
              {
                name: "web_search",
                description: "Search the web",
                inputSchema: { type: "object" },
              },
            ],
          },
        },
      },
      {
        search: searchConfig,
      },
    );

    process.env.GLM_MCP_CONFIG = configPath;
    process.env.GLM_MCP_CACHE_PATH = cachePath;

    const tools = new Map<
      string,
      {
        execute: (
          toolCallId: string,
          params: Record<string, unknown>,
          signal?: AbortSignal,
        ) => Promise<any>;
      }
    >();
    const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
    const sendMessage = vi.fn();

    await registerMcpExtension({
      registerTool: (tool: {
        name: string;
        execute: (
          toolCallId: string,
          params: Record<string, unknown>,
          signal?: AbortSignal,
        ) => Promise<any>;
      }) => {
        tools.set(tool.name, tool);
      },
      registerCommand: (
        name: string,
        options: { handler: (args: string, ctx: any) => Promise<void> },
      ) => {
        commands.set(name, options);
      },
      sendMessage,
      on: vi.fn(),
    } as any);

    expect([...tools.keys()]).toEqual(["mcp__search__proxy"]);

    const proxyTool = tools.get("mcp__search__proxy");
    const listResult = await proxyTool?.execute("tool-1", { action: "list" });
    expect(listResult?.content?.[0]?.text).toContain("search (1 tool):");
    expect(listResult?.content?.[0]?.text).toContain("web_search: Search the web");

    await commands.get("mcp")?.handler("", { hasUI: false });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        customType: "mcp",
        content: "search: 1 tool | mode proxy | proxy",
      }),
      expect.any(Object),
    );
  });

  test("registers cached direct tools in hybrid mode without eager connection", async () => {
    const dir = mkdtempSync(join(tmpdir(), "glm-mcp-runtime-"));
    const configPath = join(dir, "mcp.json");
    const cachePath = join(dir, "mcp-cache.json");

    writeFileSync(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            reader: {
              command: "npx",
              toolMode: "hybrid",
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const readerConfig = resolveMcpServerConfig({
      command: "npx",
      toolMode: "hybrid",
    });
    saveMcpMetadataCache(
      cachePath,
      {
        version: 1,
        servers: {
          reader: {
            configHash: "placeholder",
            cachedAt: Date.now(),
            tools: [
              {
                name: "web_reader",
                description: "Read a web page",
                inputSchema: { type: "object" },
              },
            ],
          },
        },
      },
      {
        reader: readerConfig,
      },
    );

    process.env.GLM_MCP_CONFIG = configPath;
    process.env.GLM_MCP_CACHE_PATH = cachePath;

    const tools: string[] = [];
    const notify = vi.fn();

    await registerMcpExtension({
      registerTool: (tool: { name: string }) => {
        tools.push(tool.name);
      },
      registerCommand: (
        _name: string,
        _options: { handler: (args: string, ctx: any) => Promise<void> },
      ) => {},
      sendMessage: vi.fn(),
      on: vi.fn(),
    } as any);

    expect(tools).toEqual(["mcp__reader__web_reader"]);
    expect(tools).not.toContain("mcp__reader__proxy");

    const commandApi = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
    await registerMcpExtension({
      registerTool: vi.fn(),
      registerCommand: (
        name: string,
        options: { handler: (args: string, ctx: any) => Promise<void> },
      ) => {
        commandApi.set(name, options);
      },
      sendMessage: vi.fn(),
      on: vi.fn(),
    } as any);
    await commandApi.get("mcp")?.handler("", {
      hasUI: true,
      ui: { notify },
    });
    expect(notify).toHaveBeenCalledWith("reader: 1 tool | mode hybrid | cached", "info");
  });
});
