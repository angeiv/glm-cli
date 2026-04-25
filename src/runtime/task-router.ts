import type { PromptMode } from "../prompt/mode-overlays.js";

export type TaskRouterDecision = {
  mode: PromptMode;
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

export function routePromptModeForTask(args: {
  task: string;
  loopEnabled: boolean;
}): TaskRouterDecision {
  const task = normalizeTaskText(args.task);

  if (args.loopEnabled) {
    return {
      mode: "intensive",
      reason: "loop enabled",
    };
  }

  if (isLikelyTrivialTask(task)) {
    return {
      mode: "direct",
      reason: "trivial task heuristic",
    };
  }

  return {
    mode: "standard",
    reason: "default lane",
  };
}

