import type { PromptMode } from "./mode-overlays.js";

export function buildTaskOverlay(task: string, mode: PromptMode): string {
  const trimmedTask = task.trim();

  const instructions =
    mode === "direct"
      ? [
          "- Work the bounded task directly.",
          "- Keep the change minimal and report the concrete result.",
        ]
      : mode === "intensive"
        ? [
            "- Start with a short plan.",
            "- Make the smallest coherent fix or change.",
            "- Stop after the focused implementation so verification can run.",
          ]
        : [
            "- Start with a short plan when needed.",
            "- Make the smallest coherent change that completes the task.",
            "- Verify before claiming success when the repo offers a practical check.",
          ];

  return [
    `Task overlay (${mode}):`,
    trimmedTask,
    "",
    "Round instructions:",
    ...instructions,
  ].join("\n");
}
