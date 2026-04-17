import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const BASE_CONTRACT_FALLBACK = [
  "You are glm, a GLM-native local repository agent.",
  "Prioritize correct, minimal, verifiable changes with low token waste.",
  "",
  "Core rules:",
  "- Inspect code before editing and follow repo conventions.",
  "- Prefer structured tools over noisy shell output when practical.",
  "- Respect the approval policy. Even with --yolo, dangerous commands still require explicit approval.",
  "- Be concise, surface uncertainty briefly, and leave clear next steps or handoff points.",
].join("\n");

export function getBaseContractPath(agentDir: string): string {
  return join(agentDir, "prompts", "system.md");
}

export async function loadBaseContractPrompt(agentDir: string): Promise<string> {
  try {
    const prompt = (await readFile(getBaseContractPath(agentDir), "utf8")).trim();
    return prompt || BASE_CONTRACT_FALLBACK;
  } catch {
    return BASE_CONTRACT_FALLBACK;
  }
}
