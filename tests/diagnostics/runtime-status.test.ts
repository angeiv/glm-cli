import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  clearRuntimeStatus,
  buildRuntimeStatus,
  formatRuntimeStatusLines,
} from "../../src/diagnostics/runtime-status.js";
import { resolveGlmSessionPaths } from "../../src/session/session-paths.js";

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
            search: {
              type: "streamable-http",
              url: "https://example.com/mcp",
              toolMode: "proxy",
            },
            local: {
              command: "npx",
              args: ["-y", "server"],
              toolMode: "hybrid",
            },
            direct: { command: "node" },
            disabled: { command: "node", disabled: true },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    const artifactDir = join(resolveGlmSessionPaths("/tmp/repo").sessionDir, "artifacts");
    mkdirSync(artifactDir, { recursive: true });
    const artifactPath = join(artifactDir, "verify-latest.json");
    writeFileSync(
      artifactPath,
      `${JSON.stringify(
        {
          kind: "verification",
          version: 1,
          id: "verify-latest",
          createdAt: "2026-04-24T00:00:00.000Z",
          cwd: "/tmp/repo",
          resolution: {
            kind: "command",
            command: "pnpm test",
            source: "explicit",
          },
          verification: {
            kind: "fail",
            command: "pnpm test",
            exitCode: 1,
            summary: "tests failed",
          },
        },
        null,
        2,
      )}\n`,
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
      notifications: {
        enabled: true,
        onTurnEnd: true,
        onLoopResult: false,
      },
      paths: {
        agentDir: "/tmp/.glm/agent",
        sessionDir: "/tmp/.glm/sessions/demo",
        authPath: "/tmp/.glm/agent/auth.json",
        modelsPath: "/tmp/.glm/agent/models.json",
      },
      env: {
        GLM_MCP_CONFIG: mcpPath,
        GLM_MCP_CACHE_PATH: join(dir, "mcp-cache.json"),
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
      cachePath: join(dir, "mcp-cache.json"),
      enabled: true,
      configuredServerCount: 3,
      modeCounts: {
        direct: 1,
        proxy: 1,
        hybrid: 1,
      },
    });
    expect(status.diagnostics).toMatchObject({
      debugRuntime: true,
      eventLogLimit: 25,
    });
    expect(status.notifications).toMatchObject({
      enabled: true,
      onTurnEnd: true,
      onLoopResult: false,
    });
    expect(status.verification.latest).toMatchObject({
      artifactPath,
      kind: "fail",
      command: "pnpm test",
      exitCode: 1,
      summary: "tests failed",
    });
    expect(formatRuntimeStatusLines(status)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`Verification: fail | pnpm test | tests failed | ${artifactPath}`),
      ]),
    );
    expect(status.paths.sessionDir).toBe("/tmp/.glm/sessions/demo");
  });
});
