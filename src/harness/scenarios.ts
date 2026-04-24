import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import {
  detectCodeVerifier,
  detectBuildVerifier,
} from "../loop/verify-detect.js";
import type { VerificationCommandResolution } from "../loop/types.js";

export type VerifyScenarioName = "smoke" | "test" | "build";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readPackageManagerCommand(cwd: string): Promise<string | undefined> {
  const path = join(cwd, "package.json");
  if (!(await fileExists(path))) {
    return undefined;
  }

  try {
    const pkg = JSON.parse(await readFile(path, "utf8")) as { packageManager?: unknown };
    const raw = typeof pkg.packageManager === "string" ? pkg.packageManager : "";
    if (raw.startsWith("pnpm@")) return "pnpm";
    if (raw.startsWith("yarn@")) return "yarn";
    if (raw.startsWith("bun@")) return "bun";
    return "npm";
  } catch {
    return undefined;
  }
}

export async function resolveVerifyScenario(args: {
  cwd: string;
  scenario?: VerifyScenarioName;
  detectVerifier?: (cwd: string) => Promise<VerificationCommandResolution>;
}): Promise<VerificationCommandResolution | undefined> {
  if (!args.scenario) {
    return undefined;
  }

  if (args.scenario === "smoke") {
    const detected = await (args.detectVerifier ?? detectCodeVerifier)(args.cwd);
    if (detected.kind === "command") {
      return {
        ...detected,
        source: "scenario:smoke",
      };
    }
    return detected;
  }

  if (args.scenario === "test") {
    const detected = await (args.detectVerifier ?? detectCodeVerifier)(args.cwd);
    if (detected.kind === "command") {
      return {
        ...detected,
        source: "scenario:test",
      };
    }
    return {
      kind: "unavailable",
      source: "scenario:test",
      summary: detected.summary,
    };
  }

  const detected = await detectBuildVerifier(args.cwd);
  if (detected.kind === "command") {
    return {
      ...detected,
      source: "scenario:build",
    };
  }

  const packageManager = await readPackageManagerCommand(args.cwd);
  if (packageManager) {
    return {
      kind: "command",
      command: `${packageManager} build`,
      source: "scenario:build",
    };
  }

  return {
    kind: "unavailable",
    source: "scenario:build",
    summary: detected.summary,
  };
}
