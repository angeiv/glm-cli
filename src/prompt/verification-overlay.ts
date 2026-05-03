import type { VerificationResult } from "../loop/types.js";

export function buildVerificationOverlay(result: VerificationResult, nextRound: number): string {
  return [
    `Verification overlay: repair round ${nextRound}.`,
    result.command ? `Verifier: ${result.command}` : "Verifier: unavailable",
    `Failure summary: ${result.summary}`,
    ...(result.artifactRef
      ? [
          `Artifact reference: verification | ${result.artifactRef.path}`,
          ...(result.artifactRef.stdoutSummary
            ? [`Artifact stdout summary: ${result.artifactRef.stdoutSummary}`]
            : []),
          ...(result.artifactRef.stderrSummary
            ? [`Artifact stderr summary: ${result.artifactRef.stderrSummary}`]
            : []),
          "Use the artifact summary first. Inspect the artifact file only if you need full verifier output.",
        ]
      : []),
    "",
    "Repair instructions:",
    "- Fix only the verifier-reported failure.",
    "- Avoid unrelated refactors or new feature work.",
    "- Stop when the fix is ready for the next verification step.",
  ].join("\n");
}
