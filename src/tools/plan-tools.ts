import { Type } from "@sinclair/typebox";
import { defineTool } from "@mariozechner/pi-coding-agent";

export type PlanItem = { step: string; status: string };

export type PlanState = { items: PlanItem[] };

export function createPlanState(): PlanState {
  return { items: [] };
}

export function updatePlan(state: PlanState, items: PlanItem[]) {
  state.items = items;
}

export function markPlanTaskDone(state: PlanState, step: string, status: string = "done") {
  const existing = state.items.find((item) => item.step === step);
  if (existing) {
    existing.status = status;
    return existing;
  }

  const next = { step, status };
  state.items.push(next);
  return next;
}

const planItemSchema = Type.Object({
  step: Type.String({ description: "Name of the plan step" }),
  status: Type.String({ description: "Current status (pending, in_progress, done, etc.)" }),
});

const updatePlanSchema = Type.Object({
  items: Type.Array(planItemSchema),
});

const markTaskDoneSchema = Type.Object({
  step: Type.String({ description: "Step identifier to mark as complete" }),
  status: Type.Optional(
    Type.String({
      description: "Optional status override (defaults to 'done')",
    }),
  ),
});

export function createPlanTools() {
  const state = createPlanState();

  const updatePlanTool = defineTool({
    name: "update_plan",
    label: "Update plan",
    description: "Replace the current tracked plan with a new step list.",
    parameters: updatePlanSchema,
    execute: async (_toolCallId, params) => {
      updatePlan(state, params.items);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(state.items, null, 2),
          },
        ],
        details: {},
      };
    },
  });

  const markTaskDoneTool = defineTool({
    name: "mark_task_done",
    label: "Mark task done",
    description: "Mark a plan task as completed (or set a custom status).",
    parameters: markTaskDoneSchema,
    execute: async (_toolCallId, params) => {
      const result = markPlanTaskDone(state, params.step, params.status);
      return {
        content: [
          {
            type: "text",
            text: `Updated step '${result.step}' → ${result.status}`,
          },
        ],
        details: {},
      };
    },
  });

  const showPlanTool = defineTool({
    name: "show_plan",
    label: "Show plan",
    description: "Render the current tracked plan for review.",
    parameters: Type.Object({}),
    execute: async () => {
      const listing =
        state.items.length === 0
          ? "No plan items yet."
          : state.items
              .map((item, index) => `${index + 1}. ${item.step} (${item.status})`)
              .join("\n");
      return {
        content: [{ type: "text", text: listing }],
        details: {},
      };
    },
  });

  return [updatePlanTool, markTaskDoneTool, showPlanTool];
}
