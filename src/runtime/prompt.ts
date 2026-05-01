import { getBaseContractPath, loadBaseContractPrompt } from "../prompt/base-contract.js";
import { buildModeOverlay, type PromptMode } from "../prompt/mode-overlays.js";
import { buildRepoOverlay } from "../prompt/repo-overlay.js";
import { buildTaskOverlay } from "../prompt/task-overlay.js";
import { buildVerificationOverlay } from "../prompt/verification-overlay.js";
import type { VerificationResult } from "../loop/types.js";
import { buildRepoContextPack } from "./repo-context.js";

export type RuntimePromptStack = {
  systemPrompt: string;
  appendSystemPrompt: string[];
};

export function getSystemPromptPath(agentDir: string): string {
  return getBaseContractPath(agentDir);
}

export async function loadSystemPrompt(agentDir: string): Promise<string> {
  return loadBaseContractPrompt(agentDir);
}

export async function buildRuntimePromptStack(args: {
  agentDir: string;
  cwd: string;
  mode: PromptMode;
}): Promise<RuntimePromptStack> {
  const repoOverlay = await buildRepoOverlay(args.cwd);
  const repoContextPack = await buildRepoContextPack(args.cwd);

  return {
    systemPrompt: await loadSystemPrompt(args.agentDir),
    appendSystemPrompt: [
      buildModeOverlay(args.mode),
      ...(repoOverlay ? [repoOverlay] : []),
      ...(repoContextPack ? [repoContextPack] : []),
    ],
  };
}

export function composeTaskPrompt(task: string, mode: PromptMode): string {
  return buildTaskOverlay(task, mode);
}

export function composeRepairPrompt(result: VerificationResult, nextRound: number): string {
  return buildVerificationOverlay(result, nextRound);
}
