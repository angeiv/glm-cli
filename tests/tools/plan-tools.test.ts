import { expect, test } from "vitest";
import { createBuiltinTools } from "../../src/tools/index.js";
import { createPlanState, createPlanTools, updatePlan } from "../../src/tools/plan-tools.js";

test("createPlanState starts empty and updatePlan replaces the tracked task list", () => {
  const state = createPlanState();
  expect(state.items).toEqual([]);
  updatePlan(state, [{ step: "bootstrap", status: "in_progress" }]);
  expect(state.items).toEqual([{ step: "bootstrap", status: "in_progress" }]);
});

test("createBuiltinTools exposes the edit tool definition", () => {
  const tools = createBuiltinTools(process.cwd());
  expect(tools.some((tool) => tool.name === "edit")).toBe(true);
});

test("plan tools share state between update, mark, and show helpers", async () => {
  const [updateTool, markTool, showTool] = createPlanTools();
  await updateTool.execute("1", {
    items: [{ step: "bootstrap", status: "pending" }],
  });
  await markTool.execute("2", { step: "bootstrap" });
  const result = await showTool.execute();
  expect(result.content[0].text).toContain("bootstrap (done)");
});
