import { describe, expect, test } from "vitest";
import { routePromptModeForTask } from "../../src/runtime/task-router.js";

describe("task router", () => {
  test("chooses intensive when loop is enabled", () => {
    const decision = routePromptModeForTask({
      task: "fix the tests",
      loopEnabled: true,
    });

    expect(decision.mode).toBe("intensive");
  });

  test("chooses direct for documentation tasks", () => {
    const decision = routePromptModeForTask({
      task: "update README examples",
      loopEnabled: false,
    });

    expect(decision.mode).toBe("direct");
  });

  test("chooses direct for Chinese documentation tasks", () => {
    const decision = routePromptModeForTask({
      task: "修复 README 文档中的错别字",
      loopEnabled: false,
    });

    expect(decision.mode).toBe("direct");
  });

  test("chooses standard for non-trivial code tasks when loop is disabled", () => {
    const decision = routePromptModeForTask({
      task: "fix the failing tests in CI by addressing the flaky assertion",
      loopEnabled: false,
    });

    expect(decision.mode).toBe("standard");
  });
});
