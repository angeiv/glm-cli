import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { VerificationCommandResolution, VerificationResult } from "../loop/types.js";
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
};

function createArtifactId(now = new Date()): string {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `verify-${timestamp}-${suffix}`;
}

export async function writeVerificationArtifact(args: {
  cwd: string;
  scenario?: string;
  resolution: VerificationCommandResolution;
  verification: VerificationResult;
}): Promise<{ artifact: VerificationArtifact; artifactPath: string }> {
  const id = createArtifactId();
  const artifact: VerificationArtifact = {
    kind: "verification",
    version: 1,
    id,
    createdAt: new Date().toISOString(),
    cwd: args.cwd,
    ...(args.scenario ? { scenario: args.scenario } : {}),
    resolution: args.resolution,
    verification: args.verification,
  };

  const artifactDir = join(resolveGlmSessionPaths(args.cwd).sessionDir, "artifacts");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = join(artifactDir, `${id}.json`);
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  return { artifact, artifactPath };
}
