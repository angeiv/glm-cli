import { describe, expect, test } from "vitest";
import type { RuntimeStatus } from "../../src/diagnostics/types.js";
import {
  GLM_SESSION_ENV_ENTRY,
  buildGlmSessionEnvSnapshot,
  diffGlmSessionEnvSnapshots,
  normalizeSessionStartReason,
  readLatestGlmSessionEnvSnapshot,
} from "../../src/session/session-env.js";

describe("session env snapshots", () => {
  test("normalizeSessionStartReason maps known reasons and falls back safely", () => {
    expect(normalizeSessionStartReason(undefined)).toBe("startup");
    expect(normalizeSessionStartReason("resume")).toBe("resume");
    expect(normalizeSessionStartReason("new")).toBe("new");
    expect(normalizeSessionStartReason("fork")).toBe("fork");
    expect(normalizeSessionStartReason("reload")).toBe("reload");
    expect(normalizeSessionStartReason("something-else")).toBe("unknown");
  });

  test("readLatestGlmSessionEnvSnapshot returns the last valid snapshot entry", () => {
    const entries = [
      { type: "custom", customType: "other", data: { ok: true } },
      {
        type: "custom",
        customType: GLM_SESSION_ENV_ENTRY,
        data: {
          version: 1,
          recordedAt: "2026-04-25T00:00:00.000Z",
          reason: "startup",
          provider: "glm",
          model: "glm-5",
          approvalPolicy: "ask",
          resolvedModel: {
            platform: "native-bigmodel",
            upstreamVendor: "unknown",
            payloadPatchPolicy: "glm-native",
            confidence: "high",
            contextWindow: 128,
            maxOutputTokens: 64,
          },
          toolSignature: {
            hash: "a".repeat(64),
            builtinCount: 4,
            customCount: 3,
            mcpServerCount: 0,
          },
          loop: {
            enabled: false,
            profile: "code",
            maxRounds: 3,
            failureMode: "handoff",
            autoVerify: true,
          },
          compaction: {
            enabled: true,
            reserveTokens: 1,
            keepRecentTokens: 2,
          },
        },
      },
      { type: "custom", customType: GLM_SESSION_ENV_ENTRY, data: { version: 2 } },
    ];

    const snapshot = readLatestGlmSessionEnvSnapshot(entries);
    expect(snapshot).toBeDefined();
    expect(snapshot?.model).toBe("glm-5");
  });

  test("diffGlmSessionEnvSnapshots reports key changes", () => {
    const baseStatus: RuntimeStatus = {
      cwd: "/tmp/repo",
      provider: "glm",
      model: "glm-5",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4/",
      resolvedModel: {
        canonicalModelId: "glm-5",
        platform: "native-bigmodel",
        upstreamVendor: "unknown",
        payloadPatchPolicy: "glm-native",
        confidence: "high",
        contextWindow: 128,
        maxOutputTokens: 64,
      },
      toolSignature: {
        hash: "a".repeat(64),
        builtinTools: ["read", "bash"],
        customTools: ["show_plan"],
        mcp: {
          disabled: true,
          configPath: "/tmp/mcp.json",
          cachePath: "/tmp/mcp-cache.json",
        },
      },
      approvalPolicy: "ask",
      loop: {
        enabled: true,
        profile: "code",
        maxRounds: 3,
        maxToolCalls: 10,
        maxVerifyRuns: 2,
        failureMode: "handoff",
        autoVerify: true,
      },
      compaction: {
        enabled: true,
        reserveTokens: 1,
        keepRecentTokens: 2,
        settingsPaths: {
          global: "/tmp/global.json",
          project: "/tmp/project.json",
        },
        sources: {
          enabled: "default",
          reserveTokens: "default",
          keepRecentTokens: "default",
        },
      },
      diagnostics: {
        debugRuntime: false,
        eventLogLimit: 10,
        eventCount: 0,
      },
      notifications: {
        enabled: false,
        onTurnEnd: true,
        onLoopResult: true,
      },
      mcp: {
        enabled: false,
        configPath: "/tmp/mcp.json",
        cachePath: "/tmp/mcp-cache.json",
        configuredServerCount: 0,
        modeCounts: {
          direct: 0,
          proxy: 0,
          hybrid: 0,
        },
      },
      verification: {},
      paths: {
        agentDir: "/tmp/.glm/agent",
        sessionDir: "/tmp/.glm/sessions/demo",
        authPath: "/tmp/.glm/agent/auth.json",
        modelsPath: "/tmp/.glm/agent/models.json",
      },
    };

    const previous = buildGlmSessionEnvSnapshot(baseStatus, "startup");
    const next = buildGlmSessionEnvSnapshot(
      {
        ...baseStatus,
        model: "glm-5.1",
        resolvedModel: {
          ...baseStatus.resolvedModel,
          canonicalModelId: "glm-5.1",
          contextWindow: 256,
        },
        toolSignature: {
          ...baseStatus.toolSignature,
          hash: "b".repeat(64),
        },
      },
      "resume",
    );

    const changes = diffGlmSessionEnvSnapshots(previous, next);
    const keys = changes.map((change) => change.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "model",
        "resolvedModel.canonicalModelId",
        "resolvedModel.contextWindow",
        "toolSignature.hash",
      ]),
    );
  });
});

