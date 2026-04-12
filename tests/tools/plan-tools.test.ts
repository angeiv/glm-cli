import { expect, test } from "vitest";
import { createPlanState, updatePlan } from "../../src/tools/plan-tools.js";

test("updatePlan replaces the tracked task list", () => {
  const state = createPlanState();
  updatePlan(state, [{ step: "bootstrap", status: "in_progress" }]);
  expect(state.items).toEqual([{ step: "bootstrap", status: "in_progress" }]);
});
