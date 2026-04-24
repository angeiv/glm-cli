import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  listVerificationArtifacts,
  readLatestVerificationArtifact,
} from "../../src/harness/artifact-index.js";
import { resolveGlmSessionPaths } from "../../src/session/session-paths.js";

function writeArtifact(cwd: string, id: string, createdAt: string, summary: string) {
  const artifactDir = join(resolveGlmSessionPaths(cwd).sessionDir, "artifacts");
  mkdirSync(artifactDir, { recursive: true });
  const artifactPath = join(artifactDir, `${id}.json`);
  writeFileSync(
    artifactPath,
    `${JSON.stringify(
      {
        kind: "verification",
        version: 1,
        id,
        createdAt,
        cwd,
        resolution: {
          kind: "command",
          command: "pnpm test",
          source: "explicit",
        },
        verification: {
          kind: "fail",
          command: "pnpm test",
          exitCode: 1,
          summary,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return artifactPath;
}

describe("artifact index", () => {
  test("lists verification artifacts newest first and includes paths", async () => {
    const cwd = join(tmpdir(), `glm-artifact-index-${Date.now()}`);
    const olderPath = writeArtifact(cwd, "verify-old", "2026-04-20T00:00:00.000Z", "old");
    const newerPath = writeArtifact(cwd, "verify-new", "2026-04-21T00:00:00.000Z", "new");

    const artifacts = await listVerificationArtifacts(cwd, 10);

    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]).toMatchObject({
      artifactPath: newerPath,
      artifact: {
        id: "verify-new",
        verification: {
          summary: "new",
        },
      },
    });
    expect(artifacts[1].artifactPath).toBe(olderPath);
  });

  test("reads the latest verification artifact", async () => {
    const cwd = join(tmpdir(), `glm-artifact-index-latest-${Date.now()}`);
    writeArtifact(cwd, "verify-old", "2026-04-20T00:00:00.000Z", "old");
    const latestPath = writeArtifact(cwd, "verify-new", "2026-04-21T00:00:00.000Z", "new");

    const latest = await readLatestVerificationArtifact(cwd);

    expect(latest?.artifactPath).toBe(latestPath);
    expect(latest?.artifact.id).toBe("verify-new");
  });
});
