import { describe, expect, test } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildMcpToolName,
  readMcpConfig,
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
});

