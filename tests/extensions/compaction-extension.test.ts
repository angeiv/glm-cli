import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { describe, expect, test, vi } from "vitest";
import { setRuntimeStatus } from "../../src/diagnostics/runtime-status.js";

const { compactMock } = vi.hoisted(() => ({
  compactMock: vi.fn(),
}));

vi.mock("@mariozechner/pi-coding-agent", async () => {
  const actual = await vi.importActual<any>("@mariozechner/pi-coding-agent");
  return { ...actual, compact: compactMock };
});

describe("glm-compaction extension", () => {
  test("injects focused compaction summary that preserves loop handoff metadata", async () => {
    const { default: registerCompactionExtension } = await import(
      "../../resources/extensions/glm-compaction/index.ts"
    );

    compactMock.mockResolvedValue({
      summary:
        "## Goal\nSomething\n\n<read-files>\n/tmp/old-read\n</read-files>\n\n<modified-files>\n/tmp/old-mod\n</modified-files>",
      firstKeptEntryId: "entry-1",
      tokensBefore: 123,
      details: { readFiles: ["/tmp/read-now"], modifiedFiles: ["/tmp/mod-now"] },
    });

    const handlers = new Map<string, (...args: any[]) => any>();
    registerCompactionExtension({
      on: (event: string, handler: (...args: any[]) => any) => {
        handlers.set(event, handler);
      },
    } as unknown as ExtensionAPI);

    setRuntimeStatus({
      cwd: "/tmp/repo",
      provider: "glm",
      model: "glm-5",
      resolvedModel: {
        canonicalModelId: "glm-5",
        platform: "native-bigmodel",
        upstreamVendor: "unknown",
        payloadPatchPolicy: "glm-native",
        confidence: "high",
        contextWindow: 204_800,
        maxOutputTokens: 131_072,
      },
      toolSignature: {
        hash: "0".repeat(64),
        builtinTools: [],
        customTools: [],
        mcp: { configPath: "" },
      },
      approvalPolicy: "ask",
      loop: {
        enabled: true,
        profile: "code",
        maxRounds: 3,
        failureMode: "handoff",
        autoVerify: true,
        verifyCommand: "pnpm test",
      },
      compaction: {
        enabled: true,
        reserveTokens: 16_384,
        keepRecentTokens: 20_000,
        settingsPaths: {
          global: "/tmp/.glm/agent/settings.json",
          project: "/tmp/repo/.glm/settings.json",
        },
        sources: {
          enabled: "default",
          reserveTokens: "default",
          keepRecentTokens: "default",
        },
      },
      diagnostics: {
        debugRuntime: false,
        eventLogLimit: 200,
        eventCount: 0,
      },
      notifications: {
        enabled: false,
        onTurnEnd: false,
        onLoopResult: false,
      },
      mcp: {
        enabled: false,
        configPath: "/tmp/repo/mcp.json",
        cachePath: "/tmp/repo/mcp-cache.json",
        configuredServerCount: 0,
        modeCounts: { direct: 0, proxy: 0, hybrid: 0 },
      },
      verification: {
        latest: {
          artifactPath: "/tmp/repo/artifacts/verify-1.json",
          createdAt: "2026-04-24T00:00:00.000Z",
          kind: "fail",
          command: "pnpm test",
          exitCode: 1,
          summary: "tests failed",
        },
      },
      paths: {
        agentDir: "/tmp/.glm/agent",
        sessionDir: "/tmp/.glm/sessions/repo",
        authPath: "/tmp/.glm/agent/auth.json",
        modelsPath: "/tmp/.glm/agent/models.json",
      },
    } as any);

    const beforeCompact = handlers.get("session_before_compact");
    expect(beforeCompact).toBeDefined();

    const branchEntries = [
      {
        type: "compaction",
        id: "compaction-0",
        details: { readFiles: ["/tmp/read-prev"], modifiedFiles: ["/tmp/mod-prev"] },
      },
      {
        type: "custom",
        customType: "glm.loop.state",
        data: {
          enabled: true,
          profile: "code",
          maxRounds: 4,
          failureMode: "handoff",
          autoVerify: true,
          verifyCommand: "pnpm test",
        },
      },
      {
        type: "custom",
        customType: "glm.loop.result",
        data: {
          status: "handoff",
          task: "fix failing tests",
          rounds: 2,
          verification: {
            kind: "fail",
            command: "pnpm test",
            exitCode: 1,
            summary: "tests failed",
            artifactPath: "/tmp/repo/artifacts/verify-1.json",
          },
          outcome: "handoff",
          completedAt: "2026-04-25T00:00:00.000Z",
        },
      },
    ];

    const result = await beforeCompact?.(
      {
        type: "session_before_compact",
        preparation: {} as any,
        branchEntries,
        customInstructions: undefined,
        signal: new AbortController().signal,
      },
      {
        model: { id: "glm-5", provider: "glm" },
        modelRegistry: {
          getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "key", headers: {} }),
        },
      } as any,
    );

    expect(compactMock).toHaveBeenCalled();
    const [, , , , customInstructions] = compactMock.mock.calls[0];
    expect(String(customInstructions)).toContain("Runtime: provider=glm");
    expect(String(customInstructions)).toContain("Loop (persisted): enabled=on");
    expect(String(customInstructions)).toContain("Loop result (latest): status=handoff");

    expect(result?.compaction).toBeDefined();
    expect(result?.compaction?.details).toMatchObject({
      readFiles: ["/tmp/read-now", "/tmp/read-prev"],
      modifiedFiles: ["/tmp/mod-now", "/tmp/mod-prev"],
    });
    expect(String(result?.compaction?.summary)).toContain("<read-files>");
    expect(String(result?.compaction?.summary)).toContain("/tmp/read-prev");
    expect(String(result?.compaction?.summary)).toContain("<modified-files>");
    expect(String(result?.compaction?.summary)).toContain("/tmp/mod-now");
  });
});
