import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildRepoContextPack, findRepoRoot } from "../../src/runtime/repo-context.js";

describe("repo context pack", () => {
  test("finds repo root via .git and extracts AGENTS.md sections", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "glm-repo-context-"));
    mkdirSync(join(repoRoot, ".git"), { recursive: true });
    mkdirSync(join(repoRoot, "subdir"), { recursive: true });

    writeFileSync(
      join(repoRoot, "AGENTS.md"),
      [
        "# AGENTS",
        "",
        "## Command map",
        "",
        "- `pnpm test`: run tests",
        "- `pnpm build`: build",
        "",
        "## Change rules",
        "",
        "- Keep changes small and atomic.",
        "- Use pnpm.",
        "",
        "## Something else",
        "",
        "Ignore this section.",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(repoRoot, "package.json"),
      JSON.stringify(
        {
          packageManager: "pnpm@10.33.0",
          scripts: {
            test: "vitest --run",
            build: "tsc -p tsconfig.json",
            lint: "biome check .",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    expect(await findRepoRoot(join(repoRoot, "subdir"))).toBe(repoRoot);

    const pack = await buildRepoContextPack(join(repoRoot, "subdir"));
    expect(pack).toContain("Repo context pack (auto):");
    expect(pack).toContain("Command map (from AGENTS.md):");
    expect(pack).toContain("pnpm test");
    expect(pack).toContain("Change rules (from AGENTS.md):");
    expect(pack).toContain("Keep changes small and atomic.");
    expect(pack).toContain("Repo scripts (auto):");
    expect(pack).toContain("test: pnpm test");
    expect(pack).not.toContain("Ignore this section.");
  });
});
