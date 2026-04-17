import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildRuntimePromptStack,
  composeRepairPrompt,
  composeTaskPrompt,
} from "../../src/runtime/prompt.js";

describe("runtime prompt stack", () => {
  test("builds a shorter stable system prompt plus mode and repo overlays", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "glm-prompt-cwd-"));
    const agentDir = mkdtempSync(join(tmpdir(), "glm-prompt-agent-"));

    writeFileSync(join(cwd, "package.json"), JSON.stringify({
      packageManager: "pnpm@10.33.0",
      type: "module",
    }), "utf8");
    writeFileSync(join(cwd, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
      },
    }), "utf8");

    mkdirSync(join(agentDir, "prompts"), { recursive: true });
    writeFileSync(join(agentDir, "prompts", "system.md"), [
      "You are glm, a GLM-native local repository agent.",
      "Keep the base prompt stable and concise.",
    ].join("\n"), "utf8");

    const stack = await buildRuntimePromptStack({
      agentDir,
      cwd,
      mode: "intensive",
    });

    expect(stack.systemPrompt).toContain("You are glm");
    expect(stack.appendSystemPrompt.join("\n\n")).toContain("Execution lane: intensive");
    expect(stack.appendSystemPrompt.join("\n\n")).toContain("Use pnpm");
    expect(stack.appendSystemPrompt.join("\n\n")).toContain("NodeNext/ESM");
  });

  test("task and repair overlays stay narrow", () => {
    const taskPrompt = composeTaskPrompt("fix failing tests", "intensive");
    expect(taskPrompt).toContain("Task overlay (intensive):");
    expect(taskPrompt).toContain("fix failing tests");
    expect(taskPrompt).not.toContain("Respect the approval policy");

    const repairPrompt = composeRepairPrompt({
      kind: "fail",
      command: "pnpm test",
      exitCode: 1,
      summary: "1 test failed",
    }, 2);

    expect(repairPrompt).toContain("Verification overlay: repair round 2.");
    expect(repairPrompt).toContain("pnpm test");
    expect(repairPrompt).toContain("1 test failed");
    expect(repairPrompt).not.toContain("Start with a short explicit plan before editing.");
  });
});
