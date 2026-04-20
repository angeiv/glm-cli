import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { clearRuntimeStatus, buildRuntimeStatus } from "../../src/diagnostics/runtime-status.js";

afterEach(() => {
  clearRuntimeStatus();
});

describe("buildRuntimeStatus", () => {
  test("summarizes effective runtime state including MCP and diagnostics", async () => {
    const dir = mkdtempSync(join(tmpdir(), "glm-runtime-status-"));
    const mcpPath = join(dir, "mcp.json");
    writeFileSync(
      mcpPath,
      JSON.stringify(
        {
          mcpServers: {
            search: { type: "streamable-http", url: "https://example.com/mcp" },
            local: { command: "npx", args: ["-y", "server"] },
            disabled: { command: "node", disabled: true },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const status = await buildRuntimeStatus({
      cwd: "/tmp/repo",
      runtime: {
        provider: "glm",
        model: "glm-5.1",
        approvalPolicy: "auto",
      },
      loop: {
        enabled: true,
        profile: "code",
        maxRounds: 4,
        failureMode: "handoff",
        autoVerify: true,
        verifyCommand: "pnpm test",
      },
      diagnostics: {
        debugRuntime: true,
        eventLogLimit: 25,
      },
      paths: {
        agentDir: "/tmp/.glm/agent",
        sessionDir: "/tmp/.glm/sessions/demo",
        authPath: "/tmp/.glm/agent/auth.json",
        modelsPath: "/tmp/.glm/agent/models.json",
      },
      env: {
        GLM_MCP_CONFIG: mcpPath,
      },
    });

    expect(status.provider).toBe("glm");
    expect(status.model).toBe("glm-5.1");
    expect(status.resolvedModel).toMatchObject({
      canonicalModelId: "glm-5.1",
      platform: "native-bigmodel",
      upstreamVendor: "unknown",
      payloadPatchPolicy: "glm-native",
      confidence: "high",
    });
    expect(status.approvalPolicy).toBe("auto");
    expect(status.loop).toMatchObject({
      enabled: true,
      profile: "code",
      maxRounds: 4,
      verifyCommand: "pnpm test",
    });
    expect(status.mcp).toMatchObject({
      configPath: mcpPath,
      enabled: true,
      configuredServerCount: 2,
    });
    expect(status.diagnostics).toMatchObject({
      debugRuntime: true,
      eventLogLimit: 25,
    });
    expect(status.paths.sessionDir).toBe("/tmp/.glm/sessions/demo");
  });
});
