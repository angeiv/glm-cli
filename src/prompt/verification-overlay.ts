import type { VerificationResult } from "../loop/types.js";

export function buildVerificationOverlay(result: VerificationResult, nextRound: number): string {
  return [
    `Verification overlay: repair round ${nextRound}.`,
    result.command ? `Verifier: ${result.command}` : "Verifier: unavailable",
    `Failure summary: ${result.summary}`,
    "",
    "Repair instructions:",
    "- Fix only the verifier-reported failure.",
    "- Avoid unrelated refactors or new feature work.",
    "- Stop when the fix is ready for the next verification step.",
  ].join("\n");
}
