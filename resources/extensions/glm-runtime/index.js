import {
  buildRuntimeEventLines,
  buildRuntimeStatusLines,
  clearRuntimeEvents,
  getRuntimeEvents,
  getRuntimeStatus,
} from "../shared/runtime-state.js";

const RUNTIME_WIDGET_KEY = "glm.runtime";
const EVENTS_WIDGET_KEY = "glm.events";

function emitMessage(pi, customType, lines) {
  pi.sendMessage(
    {
      customType,
      content: lines.join("\n"),
      display: true,
      details: {},
    },
    { triggerTurn: false, deliverAs: "nextTurn" },
  );
}

export default function (pi) {
  pi.registerCommand("inspect", {
    description: "Show the effective glm runtime state for the current session.",
    handler: async (_args, ctx) => {
      const status = getRuntimeStatus();
      const lines = status
        ? buildRuntimeStatusLines(status)
        : ["Runtime status unavailable. Start or reload a glm session first."];

      if (ctx.hasUI) {
        ctx.ui.setWidget(RUNTIME_WIDGET_KEY, lines, { placement: "belowEditor" });
        ctx.ui.notify("Updated runtime widget", "info");
        return;
      }

      emitMessage(pi, "glm.inspect", lines);
    },
  });

  pi.registerCommand("events", {
    description: "Show recent glm runtime events, or clear the retained event log.",
    handler: async (args, ctx) => {
      const trimmed = args.trim();

      if (trimmed === "clear") {
        clearRuntimeEvents();
        if (ctx.hasUI) {
          ctx.ui.setWidget(EVENTS_WIDGET_KEY, undefined);
          ctx.ui.notify("Cleared runtime events", "info");
          return;
        }

        emitMessage(pi, "glm.events", ["Cleared runtime events."]);
        return;
      }

      const lines = buildRuntimeEventLines(getRuntimeEvents());
      if (ctx.hasUI) {
        ctx.ui.setWidget(EVENTS_WIDGET_KEY, lines, { placement: "belowEditor" });
        ctx.ui.notify("Updated runtime events widget", "info");
        return;
      }

      emitMessage(pi, "glm.events", lines);
    },
  });
}
