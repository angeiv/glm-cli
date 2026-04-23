import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { inspectRuntime, runInspectCommand } from "../../src/commands/inspect.js";
import { getDefaultConfigFile } from "../../src/app/config-store.js";

describe("inspectRuntime", () => {
  test("builds a stable runtime snapshot from config, env, and CLI flags", async () => {
    const dir = mkdtempSync(join(tmpdir(), "glm-inspect-"));
    const mcpPath = join(dir, "mcp.json");
    writeFileSync(
      mcpPath,
      JSON.stringify({
        mcpServers: {
          reader: { type: "streamable-http", url: "https://example.com/mcp" },
        },
      }),
      "utf8",
    );

    const status = await inspectRuntime(
      {
        cwd: "/tmp/repo",
        cli: {
          provider: "openai-compatible",
          model: "glm-openai",
          yolo: true,
          loop: true,
          verify: "pnpm test",
          maxRounds: 5,
          failMode: "fail",
        },
        env: {
          GLM_MCP_CONFIG: mcpPath,
        },
      },
      {
        readConfigFile: async () => ({
          ...getDefaultConfigFile(),
          debugRuntime: true,
          eventLogLimit: 64,
        }),
      },
    );

    expect(status.provider).toBe("openai-compatible");
    expect(status.model).toBe("glm-openai");
    expect(status.resolvedModel).toMatchObject({
      platform: "unknown",
      payloadPatchPolicy: "safe-openai-compatible",
      confidence: "low",
    });
    expect(status.approvalPolicy).toBe("never");
    expect(status.loop).toMatchObject({
      enabled: true,
      maxRounds: 5,
      failureMode: "fail",
      verifyCommand: "pnpm test",
    });
    expect(status.mcp.configuredServerCount).toBe(1);
    expect(status.diagnostics).toMatchObject({
      debugRuntime: true,
      eventLogLimit: 64,
    });
  });
});

describe("runInspectCommand", () => {
  test("prints structured JSON when --json is requested", async () => {
    const log = vi.fn();

    const exitCode = await runInspectCommand(
      {
        cwd: "/tmp/repo",
        cli: {
          provider: "glm",
          model: "glm-5.1",
          yolo: false,
        },
        env: {},
        json: true,
      },
      {
        log,
        readConfigFile: async () => getDefaultConfigFile(),
      },
    );

    expect(exitCode).toBe(0);
    expect(log).toHaveBeenCalledOnce();
    const payload = JSON.parse(log.mock.calls[0][0]);
    expect(payload).toMatchObject({
      provider: "glm",
      model: "glm-5.1",
      resolvedModel: expect.objectContaining({
        canonicalModelId: "glm-5.1",
        payloadPatchPolicy: "glm-native",
      }),
      loop: expect.objectContaining({
        profile: "code",
      }),
      diagnostics: expect.objectContaining({
        debugRuntime: false,
        eventLogLimit: 200,
      }),
    });
  });
});
