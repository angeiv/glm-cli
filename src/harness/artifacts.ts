import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  VerificationArtifactReference,
  VerificationCommandResolution,
  VerificationResult,
} from "../loop/types.js";
import { resolveGlmSessionPaths } from "../session/session-paths.js";

export type VerificationArtifact = {
  kind: "verification";
  version: 1;
  id: string;
  createdAt: string;
  cwd: string;
  scenario?: string;
  resolution: VerificationCommandResolution;
  verification: VerificationResult;
  digest: {
    command?: string;
    exitCode?: number;
    summary: string;
    stdoutSummary?: string;
    stderrSummary?: string;
  };
};

function createArtifactId(now = new Date()): string {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `verify-${timestamp}-${suffix}`;
}

function summarizeOutputText(
  value: string | undefined,
  maxLines = 2,
  maxChars = 160,
): string | undefined {
  if (!value) return undefined;
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);
  if (lines.length === 0) return undefined;

  const summary = lines.join(" | ");
  if (summary.length <= maxChars) {
    return summary;
  }

  return `${summary.slice(0, maxChars - 1)}…`;
}

export function buildVerificationArtifactReference(args: {
  artifact: VerificationArtifact;
  artifactPath: string;
}): VerificationArtifactReference {
  return {
    kind: "verification",
    id: args.artifact.id,
    path: args.artifactPath,
    createdAt: args.artifact.createdAt,
    ...(args.artifact.scenario ? { scenario: args.artifact.scenario } : {}),
    ...(args.artifact.digest.command ? { command: args.artifact.digest.command } : {}),
    ...(args.artifact.digest.exitCode === undefined
      ? {}
      : { exitCode: args.artifact.digest.exitCode }),
    summary: args.artifact.digest.summary,
    ...(args.artifact.digest.stdoutSummary
      ? { stdoutSummary: args.artifact.digest.stdoutSummary }
      : {}),
    ...(args.artifact.digest.stderrSummary
      ? { stderrSummary: args.artifact.digest.stderrSummary }
      : {}),
  };
}

export function formatVerificationArtifactReference(ref: VerificationArtifactReference): string[] {
  return [
    `Artifact reference: verification | ${ref.path}`,
    ref.command ? `Artifact verifier: ${ref.command}` : undefined,
    ref.exitCode === undefined ? undefined : `Artifact exit code: ${ref.exitCode}`,
    `Artifact summary: ${ref.summary}`,
    ref.stdoutSummary ? `Artifact stdout summary: ${ref.stdoutSummary}` : undefined,
    ref.stderrSummary ? `Artifact stderr summary: ${ref.stderrSummary}` : undefined,
  ].filter((line): line is string => Boolean(line));
}

export async function writeVerificationArtifact(args: {
  cwd: string;
  scenario?: string;
  resolution: VerificationCommandResolution;
  verification: VerificationResult;
}): Promise<{
  artifact: VerificationArtifact;
  artifactPath: string;
  artifactRef: VerificationArtifactReference;
}> {
  const id = createArtifactId();
  const digest = {
    ...(args.verification.command ? { command: args.verification.command } : {}),
    ...(args.verification.exitCode === undefined ? {} : { exitCode: args.verification.exitCode }),
    summary: args.verification.summary,
    ...(summarizeOutputText(args.verification.stdout)
      ? { stdoutSummary: summarizeOutputText(args.verification.stdout) }
      : {}),
    ...(summarizeOutputText(args.verification.stderr)
      ? { stderrSummary: summarizeOutputText(args.verification.stderr) }
      : {}),
  };
  const artifact: VerificationArtifact = {
    kind: "verification",
    version: 1,
    id,
    createdAt: new Date().toISOString(),
    cwd: args.cwd,
    ...(args.scenario ? { scenario: args.scenario } : {}),
    resolution: args.resolution,
    verification: args.verification,
    digest,
  };

  const artifactDir = join(resolveGlmSessionPaths(args.cwd).sessionDir, "artifacts");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = join(artifactDir, `${id}.json`);
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  const artifactRef = buildVerificationArtifactReference({
    artifact,
    artifactPath,
  });

  return { artifact, artifactPath, artifactRef };
}
