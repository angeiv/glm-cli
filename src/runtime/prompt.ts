import { readFile } from "node:fs/promises";
import { join } from "node:path";

export function getSystemPromptPath(agentDir: string): string {
  return join(agentDir, "prompts", "system.md");
}

export async function loadSystemPrompt(agentDir: string): Promise<string> {
  return readFile(getSystemPromptPath(agentDir), "utf8");
}
