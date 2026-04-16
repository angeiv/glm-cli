import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { detectCodeVerifier } from "../../src/loop/verify-detect.js";

describe("detectCodeVerifier", () => {
  test("detects pnpm test from package.json scripts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "glm-loop-detect-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "demo",
        scripts: {
          test: "vitest --run",
        },
        packageManager: "pnpm@10.0.0",
      }),
      "utf8",
    );

    const result = await detectCodeVerifier(dir);
    expect(result).toEqual({
      kind: "command",
      command: "pnpm test",
      source: "package.json",
    });
  });

  test("marks lint-only js projects as incomplete", async () => {
    const dir = mkdtempSync(join(tmpdir(), "glm-loop-detect-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "demo",
        scripts: {
          lint: "eslint .",
          build: "tsc -p tsconfig.json",
        },
      }),
      "utf8",
    );

    const result = await detectCodeVerifier(dir);
    expect(result.kind).toBe("incomplete");
    expect(result.summary).toContain("No high-confidence test command");
  });
});
