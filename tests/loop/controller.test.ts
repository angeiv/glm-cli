import { describe, expect, test, vi } from "vitest";
import { createCodeLoopProfile } from "../../src/loop/profiles/code.js";
import { runLoopController } from "../../src/loop/controller.js";

describe("runLoopController", () => {
  test("repairs once after failed verification and then succeeds", async () => {
    const prompts: string[] = [];
    const verify = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "fail",
        command: "pnpm test",
        exitCode: 1,
        summary: "1 test failed",
      })
      .mockResolvedValueOnce({
        kind: "pass",
        command: "pnpm test",
        exitCode: 0,
        summary: "all tests passed",
      });

    const result = await runLoopController({
      task: "fix tests",
      maxRounds: 3,
      failureMode: "handoff",
      profile: createCodeLoopProfile(),
      executeTurn: async (message) => {
        prompts.push(message);
      },
      runVerification: verify,
    });

    expect(result.status).toBe("succeeded");
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("Task overlay (intensive):");
    expect(prompts[0]).toContain("fix tests");
    expect(prompts[1]).toContain("Verification overlay: repair round 2.");
    expect(prompts[1]).toContain("pnpm test");
    expect(prompts[1]).toContain("1 test failed");
  });

  test("returns handoff when verification keeps failing past max rounds", async () => {
    const result = await runLoopController({
      task: "fix tests",
      maxRounds: 2,
      failureMode: "handoff",
      profile: createCodeLoopProfile(),
      executeTurn: async () => undefined,
      runVerification: async () => ({
        kind: "fail",
        command: "pnpm test",
        exitCode: 1,
        summary: "still failing",
      }),
    });

    expect(result.status).toBe("handoff");
    expect(result.summary).toContain("pnpm test");
    expect(result.summary).toContain("still failing");
  });

  test("respects the prompt mode when building the loop contract", async () => {
    const prompts: string[] = [];

    const result = await runLoopController({
      task: "fix tests",
      maxRounds: 1,
      failureMode: "handoff",
      profile: createCodeLoopProfile("direct"),
      executeTurn: async (message) => {
        prompts.push(message);
      },
      runVerification: async () => ({
        kind: "pass",
        command: "pnpm test",
        exitCode: 0,
        summary: "all tests passed",
      }),
    });

    expect(result.status).toBe("succeeded");
    expect(prompts[0]).toContain("Task overlay (direct):");
  });
});
