import type { PromptMode } from "./mode-overlays.js";

export type TaskIntent = "delivery" | "review";
export type VerifierHarnessMode = "disabled" | "loop";

export type TaskPromptProfile = {
  promptMode: PromptMode;
  taskIntent: TaskIntent;
  verifierHarness: VerifierHarnessMode;
};
