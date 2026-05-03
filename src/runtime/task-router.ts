import type { PromptMode } from "../prompt/mode-overlays.js";
import type { TaskPromptProfile } from "../prompt/task-prompt-profile.js";

export type TaskRouterDecision = {
  promptMode: PromptMode;
  taskIntent: TaskPromptProfile["taskIntent"];
  verifierHarness: TaskPromptProfile["verifierHarness"];
  reason: string;
};

function normalizeTaskText(value: string): string {
  return value.trim().toLowerCase();
}

function matchesAnyKeyword(task: string, keywords: string[]): boolean {
  return keywords.some((keyword) => keyword.length > 0 && task.includes(keyword));
}

function isLikelyTrivialTask(task: string): boolean {
  const keywords = [
    // Docs / text-only
    "readme",
    "docs",
    "doc",
    "documentation",
    "typo",
    "spelling",
    "comment",
    "changelog",
    "link",
    "links",

    // Formatting / lint-only
    "format",
    "fmt",
    "prettier",
    "lint",

    // Common Chinese task words (docs/text-only)
    "文档",
    "说明",
    "readme",
    "拼写",
    "错别字",
    "注释",
    "链接",
    "排版",
    "格式化",
  ];

  if (matchesAnyKeyword(task, keywords)) {
    return true;
  }

  // Very short tasks are often quick “do X” chores.
  if (task.length > 0 && task.length <= 24) {
    return true;
  }

  return false;
}

function isLikelyReviewTask(task: string): boolean {
  return matchesAnyKeyword(task, [
    "review",
    "audit",
    "code review",
    "pr review",
    "regression review",
    "security review",
    "审查",
    "评审",
    "代码审查",
  ]);
}

export function routeTaskExecutionForRun(args: {
  task: string;
  loopEnabled: boolean;
  promptModeOverride?: PromptMode;
}): TaskRouterDecision {
  const task = normalizeTaskText(args.task);

  if (args.loopEnabled) {
    return {
      promptMode: args.promptModeOverride ?? "intensive",
      taskIntent: "delivery",
      verifierHarness: "loop",
      reason:
        args.promptModeOverride === undefined ? "loop enabled" : "loop enabled; prompt mode override",
    };
  }

  if (isLikelyReviewTask(task)) {
    return {
      promptMode: args.promptModeOverride ?? "standard",
      taskIntent: "review",
      verifierHarness: "disabled",
      reason:
        args.promptModeOverride === undefined
          ? "review task heuristic"
          : "review task heuristic; prompt mode override",
    };
  }

  if (isLikelyTrivialTask(task)) {
    return {
      promptMode: args.promptModeOverride ?? "direct",
      taskIntent: "delivery",
      verifierHarness: "disabled",
      reason:
        args.promptModeOverride === undefined
          ? "trivial task heuristic"
          : "trivial task heuristic; prompt mode override",
    };
  }

  return {
    promptMode: args.promptModeOverride ?? "standard",
    taskIntent: "delivery",
    verifierHarness: "disabled",
    reason:
      args.promptModeOverride === undefined ? "default lane" : "default lane; prompt mode override",
  };
}

export function routePromptModeForTask(args: {
  task: string;
  loopEnabled: boolean;
  promptModeOverride?: PromptMode;
}): { mode: PromptMode; reason: string } {
  const decision = routeTaskExecutionForRun(args);
  return {
    mode: decision.promptMode,
    reason: decision.reason,
  };
}
