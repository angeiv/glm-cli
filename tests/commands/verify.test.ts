import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { getDefaultConfigFile } from "../../src/app/config-store.js";
import { runVerifyCommand, verifyProject } from "../../src/commands/verify.js";

describe("verifyProject", () => {
  test("writes a verification artifact with resolution and command output", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "glm-verify-"));

    const result = await verifyProject(
      {
        cwd,
        verify: "pnpm test",
        env: {},
      },
      {
        readConfigFile: async () => getDefaultConfigFile(),
        runVerificationCommand: async () => ({
          kind: "pass",
          command: "pnpm test",
          exitCode: 0,
          summary: "Verification passed.",
          stdout: "ok\n",
          stderr: "",
        }),
      },
    );

    expect(result.artifact).toMatchObject({
      kind: "verification",
      cwd,
      resolution: {
        kind: "command",
        command: "pnpm test",
        source: "explicit",
      },
      verification: {
        kind: "pass",
        exitCode: 0,
        summary: "Verification passed.",
      },
    });
    expect(result.artifactPath).toContain("verify-");

    const persisted = JSON.parse(readFileSync(result.artifactPath, "utf8"));
    expect(persisted).toMatchObject({
      kind: "verification",
      resolution: {
        command: "pnpm test",
      },
      verification: {
        stdout: "ok\n",
      },
    });
  });
});

describe("runVerifyCommand", () => {
  test("prints artifact path in JSON output", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "glm-verify-"));
    const log = vi.fn();

    const exitCode = await runVerifyCommand(
      {
        cwd,
        verify: "pnpm test",
        json: true,
        env: {},
      },
      {
        log,
        readConfigFile: async () => getDefaultConfigFile(),
        runVerificationCommand: async () => ({
          kind: "fail",
          command: "pnpm test",
          exitCode: 1,
          summary: "Verification failed with exit code 1.",
          stdout: "",
          stderr: "failed\n",
        }),
      },
    );

    expect(exitCode).toBe(1);
    const payload = JSON.parse(log.mock.calls[0][0]);
    expect(payload.artifactPath).toContain("verify-");
    expect(payload.artifact.verification.stderr).toBe("failed\n");
  });
});
