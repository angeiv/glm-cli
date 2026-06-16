import { describe, expect, test } from "vitest";
import { routeTaskExecutionForRun } from "../../src/runtime/task-router.js";

describe("task router", () => {
  test("chooses intensive when loop is enabled", () => {
    const decision = routeTaskExecutionForRun({
      task: "fix the tests",
      loopEnabled: true,
    });

    expect(decision).toMatchObject({
      promptMode: "intensive",
      taskIntent: "delivery",
      verifierHarness: "loop",
    });
  });

  test("chooses direct for documentation tasks", () => {
    const decision = routeTaskExecutionForRun({
      task: "update README examples",
      loopEnabled: false,
    });

    expect(decision).toMatchObject({
      promptMode: "direct",
      taskIntent: "delivery",
      verifierHarness: "disabled",
    });
  });

  test("chooses direct for Chinese documentation tasks", () => {
    const decision = routeTaskExecutionForRun({
      task: "修复 README 文档中的错别字",
      loopEnabled: false,
    });

    expect(decision).toMatchObject({
      promptMode: "direct",
      taskIntent: "delivery",
      verifierHarness: "disabled",
    });
  });

  test("chooses standard for non-trivial code tasks when loop is disabled", () => {
    const decision = routeTaskExecutionForRun({
      task: "fix the failing tests in CI by addressing the flaky assertion",
      loopEnabled: false,
    });

    expect(decision).toMatchObject({
      promptMode: "standard",
      taskIntent: "delivery",
      verifierHarness: "disabled",
    });
  });

  test("routes review tasks into the review lane without enabling verifier harness", () => {
    const decision = routeTaskExecutionForRun({
      task: "review the current patch for regressions and missing tests",
      loopEnabled: false,
    });

    expect(decision).toMatchObject({
      promptMode: "standard",
      taskIntent: "review",
      verifierHarness: "disabled",
    });
  });

  test("keeps verifier harness disabled when prompt mode is overridden without loop", () => {
    const decision = routeTaskExecutionForRun({
      task: "fix the flaky assertion",
      loopEnabled: false,
      promptModeOverride: "intensive",
    });

    expect(decision).toMatchObject({
      promptMode: "intensive",
      taskIntent: "delivery",
      verifierHarness: "disabled",
    });
  });
});
