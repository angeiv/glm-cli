export type PromptMode = "direct" | "standard" | "intensive";

const MODE_OVERLAYS: Record<PromptMode, string> = {
  direct: [
    "Execution lane: direct",
    "- Work the task directly.",
    "- Keep edits tightly scoped and avoid unnecessary scaffolding.",
    "- Verify the result when the change or repo state makes that practical.",
  ].join("\n"),
  standard: [
    "Execution lane: standard",
    "- Start with a short plan when the task is not trivial.",
    "- Make the smallest coherent change that solves the task.",
    "- Verify before claiming completion when the repo exposes a practical check.",
  ].join("\n"),
  intensive: [
    "Execution lane: intensive",
    "- Start with a short explicit plan before editing.",
    "- Keep changes scoped and reversible.",
    "- Treat external verification as the source of truth for completion.",
  ].join("\n"),
};

export function buildModeOverlay(mode: PromptMode): string {
  return MODE_OVERLAYS[mode];
}
