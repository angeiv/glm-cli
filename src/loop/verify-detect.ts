import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import type { VerificationCommandResolution } from "./types.js";

type PackageJsonShape = {
  scripts?: Record<string, unknown>;
  packageManager?: unknown;
};

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readPackageJson(cwd: string): Promise<PackageJsonShape | undefined> {
  const path = join(cwd, "package.json");
  if (!(await fileExists(path))) {
    return undefined;
  }

  try {
    return JSON.parse(await readFile(path, "utf8")) as PackageJsonShape;
  } catch {
    return undefined;
  }
}

function detectNodePackageManager(pkg: PackageJsonShape): string {
  const raw = typeof pkg.packageManager === "string" ? pkg.packageManager : "";
  if (raw.startsWith("pnpm@")) return "pnpm";
  if (raw.startsWith("yarn@")) return "yarn";
  if (raw.startsWith("bun@")) return "bun";
  return "npm";
}

function isNonEmptyScript(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

async function detectFromPackageJson(cwd: string): Promise<VerificationCommandResolution | undefined> {
  const pkg = await readPackageJson(cwd);
  if (!pkg) return undefined;

  if (isNonEmptyScript(pkg.scripts?.test)) {
    const packageManager = detectNodePackageManager(pkg);
    return {
      kind: "command",
      command: `${packageManager} test`,
      source: "package.json",
    };
  }

  const hasLowerConfidenceSignal =
    isNonEmptyScript(pkg.scripts?.lint) ||
    isNonEmptyScript(pkg.scripts?.build) ||
    isNonEmptyScript(pkg.scripts?.typecheck) ||
    isNonEmptyScript(pkg.scripts?.check);

  if (hasLowerConfidenceSignal) {
    return {
      kind: "incomplete",
      source: "package.json",
      summary:
        "No high-confidence test command was found. The project only exposes lower-confidence checks such as lint, build, or typecheck.",
    };
  }

  return undefined;
}

async function detectFromPython(cwd: string): Promise<VerificationCommandResolution | undefined> {
  const pytestIni = join(cwd, "pytest.ini");
  if (await fileExists(pytestIni)) {
    return { kind: "command", command: "pytest", source: "pytest.ini" };
  }

  const pyprojectPath = join(cwd, "pyproject.toml");
  if (!(await fileExists(pyprojectPath))) {
    return undefined;
  }

  try {
    const contents = await readFile(pyprojectPath, "utf8");
    if (
      contents.includes("[tool.pytest") ||
      contents.includes("pytest") ||
      contents.includes("tool.poetry") ||
      contents.includes("project]")
    ) {
      return { kind: "command", command: "pytest", source: "pyproject.toml" };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function detectFromGo(cwd: string): Promise<VerificationCommandResolution | undefined> {
  if (await fileExists(join(cwd, "go.mod"))) {
    return { kind: "command", command: "go test ./...", source: "go.mod" };
  }

  return undefined;
}

async function detectFromCargo(cwd: string): Promise<VerificationCommandResolution | undefined> {
  if (await fileExists(join(cwd, "Cargo.toml"))) {
    return { kind: "command", command: "cargo test", source: "Cargo.toml" };
  }

  return undefined;
}

export async function detectCodeVerifier(
  cwd: string,
): Promise<VerificationCommandResolution> {
  const detectors = [
    detectFromPackageJson,
    detectFromPython,
    detectFromGo,
    detectFromCargo,
  ];

  for (const detect of detectors) {
    const result = await detect(cwd);
    if (result) {
      return result;
    }
  }

  return {
    kind: "unavailable",
    summary:
      "No supported high-confidence verifier could be detected for this project.",
  };
}

export async function detectBuildVerifier(
  cwd: string,
): Promise<VerificationCommandResolution> {
  const pkg = await readPackageJson(cwd);
  if (pkg && isNonEmptyScript(pkg.scripts?.build)) {
    const packageManager = detectNodePackageManager(pkg);
    return {
      kind: "command",
      command: `${packageManager} build`,
      source: "package.json",
    };
  }

  if (await fileExists(join(cwd, "Cargo.toml"))) {
    return { kind: "command", command: "cargo build", source: "Cargo.toml" };
  }

  if (await fileExists(join(cwd, "go.mod"))) {
    return { kind: "command", command: "go build ./...", source: "go.mod" };
  }

  return {
    kind: "unavailable",
    summary: "No supported high-confidence build command could be detected for this project.",
  };
}
