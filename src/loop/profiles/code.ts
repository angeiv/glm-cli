import type { LoopRoundRecord, VerificationResult } from "../types.js";
import type { LoopProfile } from "./types.js";

export function createCodeLoopProfile(): LoopProfile {
  return {
    name: "code",
    buildLoopContract(task: string): string {
      return [
        "You are running inside glm's explicit delivery-quality loop for code work.",
        "Task:",
        task,
        "",
        "Requirements:",
        "- First create a short plan for the task.",
        "- Then make the minimal code changes needed.",
        "- Do not claim completion until external verification passes.",
        "- If verification fails, focus only on the reported failure.",
      ].join("\n");
    },
    buildRepairPrompt(result: VerificationResult, nextRound: number): string {
      return [
        `Verification failed. Begin repair round ${nextRound}.`,
        result.command ? `Verifier: ${result.command}` : "Verifier: unavailable",
        `Summary: ${result.summary}`,
        "",
        "Instructions:",
        "- Fix only the failure reported by the verifier.",
        "- Avoid unrelated refactors or new feature work.",
        "- When done, stop and wait for the next verification step.",
      ].join("\n");
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
        "Recommended next step: inspect the latest verifier output, apply a focused fix, and rerun verification.",
      ]
        .filter(Boolean)
        .join("\n");
    },
  };
}
