import type { LoopRoundRecord, VerificationResult } from "../types.js";
import type { LoopProfile } from "./types.js";
import { composeRepairPrompt, composeTaskPrompt } from "../../runtime/prompt.js";
import type { PromptMode } from "../../prompt/mode-overlays.js";

export function createCodeLoopProfile(promptMode: PromptMode = "intensive"): LoopProfile {
  return {
    name: "code",
    buildLoopContract(task: string): string {
      return composeTaskPrompt(task, promptMode);
    },
    buildRepairPrompt(result: VerificationResult, nextRound: number): string {
      return composeRepairPrompt(result, nextRound);
    },
    buildSuccessSummary(rounds: LoopRoundRecord[]): string {
      const totalRounds = rounds.length;
      const last = rounds[rounds.length - 1];
      return [
        `Loop succeeded after ${totalRounds} round${totalRounds === 1 ? "" : "s"}.`,
        last?.verification.command ? `Verifier: ${last.verification.command}` : undefined,
        `Summary: ${last?.verification.summary ?? "verification passed"}`,
      ]
        .filter(Boolean)
        .join("\n");
    },
    buildHandoffSummary({ task, rounds, lastResult, status }): string {
      return [
        status === "failed"
          ? "Loop stopped with failure."
          : "Loop stopped and requires human handoff.",
        `Task: ${task}`,
        `Rounds attempted: ${rounds.length}`,
        lastResult.command ? `Last verifier: ${lastResult.command}` : undefined,
        `Last result: ${lastResult.summary}`,
        lastResult.artifactRef
          ? `Artifact reference: verification | ${lastResult.artifactRef.path}`
          : undefined,
        lastResult.artifactRef?.stdoutSummary
          ? `Artifact stdout summary: ${lastResult.artifactRef.stdoutSummary}`
          : undefined,
        lastResult.artifactRef?.stderrSummary
          ? `Artifact stderr summary: ${lastResult.artifactRef.stderrSummary}`
          : undefined,
        lastResult.artifactRef
          ? "Use the artifact summary first. Inspect the artifact file only if deeper verifier output is required."
          : undefined,
        "Recommended next step: inspect the latest verifier output, apply a focused fix, and rerun verification.",
      ]
        .filter(Boolean)
        .join("\n");
    },
  };
}
