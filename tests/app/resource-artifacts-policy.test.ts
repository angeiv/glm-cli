import { execFileSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

function gitLines(args: string[]): string[] {
  const output = execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function isIgnored(path: string): boolean {
  try {
    execFileSync("git", ["check-ignore", path], {
      cwd: process.cwd(),
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

describe("resource extension artifact policy", () => {
  test("tracks only source-of-truth extension JavaScript files", () => {
    const trackedJs = gitLines(["ls-files", "--", "resources/extensions"]).filter((path) =>
      path.endsWith(".js"),
    );

    expect(trackedJs.sort()).toEqual([
      "resources/extensions/glm-runtime/index.js",
      "resources/extensions/shared/glm-user-config.js",
      "resources/extensions/shared/hooks-state.js",
      "resources/extensions/shared/notify.js",
      "resources/extensions/shared/runtime-state.js",
    ]);
  });

  test("ignores generated extension index.js files when a TypeScript source exists", () => {
    const extensionsRoot = join(process.cwd(), "resources", "extensions");
    const extensionDirs = readdirSync(extensionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const dir of extensionDirs) {
      const tsPath = join(extensionsRoot, dir, "index.ts");
      const jsPath = join("resources", "extensions", dir, "index.js");

      if (!existsSync(tsPath)) {
        continue;
      }

      expect(isIgnored(jsPath), `${jsPath} should be ignored`).toBe(true);
    }
  });

  test("keeps only hand-authored shared runtime helpers tracked", () => {
    expect(isIgnored("resources/extensions/shared/glm-profile.js")).toBe(true);
    expect(isIgnored("resources/extensions/shared/glm-user-config.js")).toBe(false);
    expect(isIgnored("resources/extensions/shared/hooks-state.js")).toBe(false);
    expect(isIgnored("resources/extensions/shared/notify.js")).toBe(false);
    expect(isIgnored("resources/extensions/shared/runtime-state.js")).toBe(false);
  });
});
