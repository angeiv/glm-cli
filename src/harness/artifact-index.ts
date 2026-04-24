import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { VerificationArtifact } from "./artifacts.js";
import { resolveGlmSessionPaths } from "../session/session-paths.js";

export type VerificationArtifactIndexEntry = {
  artifact: VerificationArtifact;
  artifactPath: string;
};

function isVerificationArtifact(value: unknown): value is VerificationArtifact {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<VerificationArtifact>;
  return (
    maybe.kind === "verification" &&
    maybe.version === 1 &&
    typeof maybe.id === "string" &&
    typeof maybe.createdAt === "string" &&
    typeof maybe.cwd === "string" &&
    !!maybe.resolution &&
    !!maybe.verification
  );
}

async function readArtifact(path: string): Promise<VerificationArtifactIndexEntry | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!isVerificationArtifact(parsed)) {
      return undefined;
    }

    return {
      artifact: parsed,
      artifactPath: path,
    };
  } catch {
    return undefined;
  }
}

export async function listVerificationArtifacts(
  cwd: string,
  limit = 10,
): Promise<VerificationArtifactIndexEntry[]> {
  const artifactDir = join(resolveGlmSessionPaths(cwd).sessionDir, "artifacts");
  let names: string[];
  try {
    names = await readdir(artifactDir);
  } catch {
    return [];
  }

  const entries = await Promise.all(
    names
      .filter((name) => name.startsWith("verify-") && name.endsWith(".json"))
      .map((name) => readArtifact(join(artifactDir, name))),
  );

  return entries
    .filter((entry): entry is VerificationArtifactIndexEntry => Boolean(entry))
    .sort((left, right) => right.artifact.createdAt.localeCompare(left.artifact.createdAt))
    .slice(0, Math.max(0, limit));
}

export async function readLatestVerificationArtifact(
  cwd: string,
): Promise<VerificationArtifactIndexEntry | undefined> {
  return (await listVerificationArtifacts(cwd, 1))[0];
}
