import { readFile } from "node:fs/promises";
import { join } from "node:path";

type PackageJson = {
  packageManager?: string;
  type?: string;
};

type TsConfigJson = {
  compilerOptions?: {
    module?: string;
    moduleResolution?: string;
  };
};

async function readJsonFile<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function normalizePackageManager(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.split("@")[0]?.toLowerCase();
}

export async function buildRepoOverlay(cwd: string): Promise<string | undefined> {
  const hints: string[] = [];

  const packageJson = await readJsonFile<PackageJson>(join(cwd, "package.json"));
  const packageManager = normalizePackageManager(packageJson?.packageManager);
  if (packageManager === "pnpm") {
    hints.push("Use pnpm for install, test, build, and dependency commands.");
  } else if (packageManager === "npm" || packageManager === "yarn" || packageManager === "bun") {
    hints.push(`Use ${packageManager} for repo-managed script and dependency commands.`);
  }

  const tsconfig = await readJsonFile<TsConfigJson>(join(cwd, "tsconfig.json"));
  const moduleValue = tsconfig?.compilerOptions?.module;
  const moduleResolutionValue = tsconfig?.compilerOptions?.moduleResolution;
  const isNodeNext = moduleValue === "NodeNext" || moduleResolutionValue === "NodeNext";

  if (
    (packageJson?.type === "module" || isNodeNext) &&
    !hints.includes("Keep NodeNext/ESM import semantics consistent with existing files.")
  ) {
    hints.push("Keep NodeNext/ESM import semantics consistent with existing files.");
  }

  if (hints.length === 0) return undefined;

  return ["Repository overlay:", ...hints.map((hint) => `- ${hint}`)].join("\n");
}
