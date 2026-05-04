import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  clearRuntimeStatus,
  buildRuntimeStatus,
  formatRuntimeStatusLines,
  getRuntimeStatus,
  patchRuntimeLoopStatus,
  setRuntimeStatus,
} from "../../src/diagnostics/runtime-status.js";
import { resolveGlmSessionPaths } from "../../src/session/session-paths.js";
import { getDefaultConfigFile, normalizeConfigFile } from "../../src/app/config-store.js";

afterEach(() => {
  clearRuntimeStatus();
});

describe("buildRuntimeStatus", () => {
  test("summarizes effective runtime state including MCP and diagnostics", async () => {
    const dir = mkdtempSync(join(tmpdir(), "glm-runtime-status-"));
    const mcpPath = join(dir, "mcp.json");
    const agentDir = join(dir, "agent");
    const discoveryFetchedAt = new Date().toISOString();
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
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "discovered-models.json"),
      JSON.stringify(
        {
          version: 1,
          entries: {
            "custom::openai-compatible::https://gateway.example.com/v1": {
              provider: "custom",
              api: "openai-compatible",
              baseUrl: "https://gateway.example.com/v1",
              fetchedAt: discoveryFetchedAt,
              models: [{ id: "glm-5.1" }, { id: "glm-5" }],
            },
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
          scenario: "smoke",
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
        provider: "custom",
        api: "openai-compatible",
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
        agentDir,
        sessionDir: "/tmp/.glm/sessions/demo",
        authPath: "/tmp/.glm/agent/auth.json",
        modelsPath: "/tmp/.glm/agent/models.json",
      },
      env: {
        GLM_MCP_CONFIG: mcpPath,
        GLM_MCP_CACHE_PATH: join(dir, "mcp-cache.json"),
      },
      config: normalizeConfigFile({
        providers: {
          ...getDefaultConfigFile().providers,
          custom: {
            apiKey: "",
            baseURL: "https://gateway.example.com/v1",
            api: "openai-compatible",
          },
        },
      }),
    });

    expect(status.provider).toBe("custom");
    expect(status.model).toBe("glm-5.1");
    expect(status.resolvedModel).toMatchObject({
      canonicalModelId: "glm-5.1",
      platform: "gateway-other",
      upstreamVendor: "unknown",
      payloadPatchPolicy: "safe-openai-compatible",
      confidence: "medium",
      contextWindow: 204_800,
      maxOutputTokens: 131_072,
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
        direct: 0,
        proxy: 1,
        hybrid: 2,
      },
    });
    expect(status.toolSignature).toMatchObject({
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      builtinTools: expect.arrayContaining(["read", "write", "grep", "bash"]),
      customTools: expect.arrayContaining(["update_plan", "mark_task_done", "show_plan"]),
      mcp: expect.objectContaining({
        configPath: mcpPath,
      }),
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
      scenario: "smoke",
      kind: "fail",
      command: "pnpm test",
      exitCode: 1,
      summary: "tests failed",
    });
    expect(status.compaction).toMatchObject({
      enabled: true,
      reserveTokens: 16_384,
      keepRecentTokens: 20_000,
    });
    expect(status.modelDiscovery).toMatchObject({
      enabled: true,
      supported: true,
      source: "cache-fresh",
      modelCount: 2,
      cachePath: join(agentDir, "discovered-models.json"),
    });
    expect(formatRuntimeStatusLines(status)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Model discovery: cache-fresh | models 2"),
        expect.stringContaining(
          `Verification: smoke | fail | pnpm test | tests failed | ${artifactPath}`,
        ),
      ]),
    );
    expect(status.paths.sessionDir).toBe("/tmp/.glm/sessions/demo");
  });

  test("reports unsupported model discovery for official providers", async () => {
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
      },
      diagnostics: {
        debugRuntime: false,
        eventLogLimit: 25,
      },
      notifications: {
        enabled: false,
        onTurnEnd: true,
        onLoopResult: false,
      },
      paths: resolveGlmSessionPaths("/tmp/repo"),
      env: {},
    });

    expect(status.modelDiscovery).toMatchObject({
      enabled: true,
      supported: false,
      source: "unsupported",
    });
    expect(formatRuntimeStatusLines(status)).toEqual(
      expect.arrayContaining([expect.stringContaining("Model discovery: unsupported")]),
    );
  });

  test("patchRuntimeLoopStatus updates the in-process runtime status store", async () => {
    const status = await buildRuntimeStatus({
      cwd: "/tmp/repo",
      runtime: {
        provider: "glm",
        model: "glm-5.1",
        approvalPolicy: "ask",
      },
      loop: {
        enabled: true,
        profile: "code",
        maxRounds: 3,
        failureMode: "handoff",
        autoVerify: true,
      },
      diagnostics: {
        debugRuntime: false,
        eventLogLimit: 10,
      },
      notifications: {
        enabled: false,
        onTurnEnd: true,
        onLoopResult: true,
      },
      paths: resolveGlmSessionPaths("/tmp/repo"),
      env: {},
    });

    setRuntimeStatus(status);
    patchRuntimeLoopStatus({
      roundsUsed: 2,
      toolCallsUsed: 5,
      verifyRunsUsed: 1,
      mode: "auto",
      phase: "verify",
    });

    const patched = getRuntimeStatus();
    expect(patched?.loop).toMatchObject({
      roundsUsed: 2,
      toolCallsUsed: 5,
      verifyRunsUsed: 1,
      mode: "auto",
      phase: "verify",
    });
  });

  test("applies model profile overrides when resolving canonical model ids", async () => {
    const status = await buildRuntimeStatus({
      cwd: "/tmp/repo",
      runtime: {
        provider: "anthropic",
        model: "ZhipuAI/GLM-5-Long",
        approvalPolicy: "ask",
      },
      loop: {
        enabled: false,
        profile: "code",
        maxRounds: 3,
        failureMode: "handoff",
        autoVerify: true,
      },
      diagnostics: {
        debugRuntime: false,
        eventLogLimit: 10,
      },
      notifications: {
        enabled: false,
        onTurnEnd: true,
        onLoopResult: true,
      },
      paths: resolveGlmSessionPaths("/tmp/repo"),
      env: {
        ANTHROPIC_BASE_URL: "https://api-inference.modelscope.cn/v1/messages",
      },
      config: normalizeConfigFile({
        modelOverrides: [
          {
            match: {
              provider: "anthropic",
              baseUrl: "*modelscope.cn*",
              modelId: "ZhipuAI/GLM-5*",
            },
            canonicalModelId: "glm-5",
            caps: {
              contextWindow: 96_000,
            },
          },
        ],
      }),
    });

    expect(status.resolvedModel).toMatchObject({
      canonicalModelId: "glm-5",
      platform: "gateway-modelscope-openai",
      confidence: "medium",
    });
  });
});
