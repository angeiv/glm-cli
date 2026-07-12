import type { TaskPromptProfile } from "./task-prompt-profile.js";

export function buildTaskOverlay(task: string, profile: TaskPromptProfile): string {
  const trimmedTask = task.trim();
  const { promptMode, taskIntent, verifierHarness } = profile;

  const instructions =
    taskIntent === "review"
      ? [
          "- Review the requested scope before proposing changes.",
          "- Prioritize concrete findings, regressions, risks, and missing tests.",
          "- Do not make code changes unless the task explicitly asks for them.",
        ]
      : promptMode === "direct"
      ? [
          "- Work the bounded task directly.",
          "- Keep the change minimal and report the concrete result.",
        ]
      : promptMode === "intensive"
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
    `Task overlay (${promptMode}/${taskIntent}):`,
    trimmedTask,
    "",
    `Verifier harness: ${verifierHarness}`,
    "Round instructions:",
    ...instructions,
  ].join("\n");
}
