import { describe, expect, test } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildMcpToolName,
  readMcpConfig,
  resolveMcpServerConfig,
  resolveMcpConfigPath,
} from "../../resources/extensions/glm-mcp/index.js";

describe("glm-mcp extension helpers", () => {
  test("buildMcpToolName namespaces and normalizes identifiers", () => {
    expect(buildMcpToolName("Brave Search", "web.search")).toBe(
      "mcp__brave_search__web_search",
    );
    expect(buildMcpToolName("  Z.ai  ", "ZhipuAI/GLM-5")).toBe(
      "mcp__z_ai__zhipuai_glm-5",
    );
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

  test("resolveMcpServerConfig rejects remote configs without url", () => {
    expect(() => resolveMcpServerConfig({ type: "streamable-http" })).toThrow(
      /url/i,
    );
  });
});
