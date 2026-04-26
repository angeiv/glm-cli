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

function keepUsefulLines(args: {
  text: string;
  maxLines: number;
  maxChars: number;
}): string[] {
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

export async function buildRepoContextPack(cwd: string): Promise<string | undefined> {
  const repoRoot = await findRepoRoot(cwd);
  const sections: RepoContextSection[] = [];

  sections.push(...(await buildAgentsSections(repoRoot)));

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

