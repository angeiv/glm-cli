import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

type RepoContextSection = {
  title: string;
  lines: string[];
};

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function findRepoRoot(startCwd: string): Promise<string> {
  let current = resolve(startCwd);

  while (true) {
    if (await pathExists(join(current, ".git"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return resolve(startCwd);
    }
    current = parent;
  }
}

async function readTextFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function readJsonFile<T>(path: string): Promise<T | undefined> {
  const raw = await readTextFile(path);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

type PackageJson = {
  packageManager?: string;
  scripts?: Record<string, string>;
};

function extractMarkdownSection(markdown: string, headingText: string): string | undefined {
  const lines = markdown.split(/\r?\n/);
  const headingRegex = /^(#{1,6})\s+(.*)$/;
  let startIndex = -1;
  let level = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = headingRegex.exec(lines[i] ?? "");
    if (!match) continue;
    const [, hashes, title] = match;
    if (title.trim().toLowerCase() !== headingText.trim().toLowerCase()) {
      continue;
    }
    startIndex = i + 1;
    level = hashes.length;
    break;
  }

  if (startIndex === -1) {
    return undefined;
  }

  const chunk: string[] = [];
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const match = headingRegex.exec(line);
    if (match) {
      const nextLevel = match[1]?.length ?? 0;
      if (nextLevel > 0 && nextLevel <= level) {
        break;
      }
    }
    chunk.push(line);
  }

  const trimmed = chunk.join("\n").trim();
  return trimmed ? trimmed : undefined;
}

function keepUsefulLines(args: { text: string; maxLines: number; maxChars: number }): string[] {
  const rawLines = args.text.split(/\r?\n/).map((line) => line.trim());
  const filtered = rawLines.filter((line) => {
    if (!line) return false;
    // Prefer bullets and short imperative sentences; keep other lines when they look actionable.
    if (line.startsWith("- ") || line.startsWith("* ")) return true;
    if (line.startsWith("`") && line.endsWith("`")) return true;
    return line.length <= 120;
  });

  const out: string[] = [];
  let chars = 0;

  for (const line of filtered) {
    if (out.length >= args.maxLines) break;
    if (chars + line.length > args.maxChars) break;
    out.push(line);
    chars += line.length + 1;
  }

  return out;
}

function normalizePackageManager(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.split("@")[0]?.toLowerCase();
}

function formatScriptCommand(packageManager: string | undefined, scriptName: string): string {
  if (packageManager === "pnpm") {
    return scriptName === "test" ? "pnpm test" : `pnpm ${scriptName}`;
  }
  if (packageManager === "yarn") {
    return scriptName === "test" ? "yarn test" : `yarn ${scriptName}`;
  }
  if (packageManager === "bun") {
    return scriptName === "test" ? "bun test" : `bun run ${scriptName}`;
  }
  if (packageManager === "npm") {
    return scriptName === "test" ? "npm test" : `npm run ${scriptName}`;
  }
  return `run ${scriptName}`;
}

async function buildAgentsSections(repoRoot: string): Promise<RepoContextSection[]> {
  const agentsPath = join(repoRoot, "AGENTS.md");
  const raw = await readTextFile(agentsPath);
  if (!raw) return [];

  const sections: RepoContextSection[] = [];
  const commandMap = extractMarkdownSection(raw, "Command map");
  if (commandMap) {
    const lines = keepUsefulLines({ text: commandMap, maxLines: 12, maxChars: 700 });
    if (lines.length) {
      sections.push({ title: "Command map (from AGENTS.md)", lines });
    }
  }

  const changeRules = extractMarkdownSection(raw, "Change rules");
  if (changeRules) {
    const lines = keepUsefulLines({ text: changeRules, maxLines: 10, maxChars: 600 });
    if (lines.length) {
      sections.push({ title: "Change rules (from AGENTS.md)", lines });
    }
  }

  return sections;
}

async function buildPackageScriptSection(repoRoot: string): Promise<RepoContextSection[]> {
  const packageJson = await readJsonFile<PackageJson>(join(repoRoot, "package.json"));
  const scripts = packageJson?.scripts;
  if (!scripts) return [];

  const preferred = ["test", "lint", "build", "typecheck", "check", "verify"];
  const packageManager = normalizePackageManager(packageJson.packageManager);
  const lines = preferred
    .filter((name) => typeof scripts[name] === "string" && scripts[name]?.trim())
    .map((name) => `- ${name}: ${formatScriptCommand(packageManager, name)}`);

  if (lines.length === 0) {
    return [];
  }

  return [{ title: "Repo scripts (auto)", lines }];
}

export async function buildRepoContextPack(cwd: string): Promise<string | undefined> {
  const repoRoot = await findRepoRoot(cwd);
  const sections: RepoContextSection[] = [];

  sections.push(...(await buildAgentsSections(repoRoot)));
  sections.push(...(await buildPackageScriptSection(repoRoot)));

  if (sections.length === 0) {
    return undefined;
  }

  const lines: string[] = ["Repo context pack (auto):"];
  for (const section of sections) {
    lines.push(`${section.title}:`);
    lines.push(...section.lines);
    lines.push("");
  }

  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n");
}
