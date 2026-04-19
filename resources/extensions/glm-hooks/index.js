// resources/extensions/shared/runtime-state.js
var GLM_EVENT_LOG_STATE = /* @__PURE__ */ Symbol.for("glm.eventLog");
function getRuntimeEventLogState() {
  const existing = globalThis[GLM_EVENT_LOG_STATE];
  if (existing && typeof existing === "object" && typeof existing.limit === "number" && typeof existing.nextId === "number" && Array.isArray(existing.events)) {
    return existing;
  }
  const state = {
    limit: 200,
    nextId: 1,
    events: []
  };
  globalThis[GLM_EVENT_LOG_STATE] = state;
  return state;
}
function appendRuntimeEvent({
  type,
  summary,
  level = "info",
  details
}) {
  const state = getRuntimeEventLogState();
  const event = {
    id: state.nextId++,
    at: (/* @__PURE__ */ new Date()).toISOString(),
    type,
    summary,
    level,
    ...details ? { details } : {}
  };
  state.events.push(event);
  if (state.events.length > state.limit) {
    state.events = state.events.slice(state.events.length - state.limit);
  }
  return event;
}

// resources/extensions/shared/hooks-state.js
var GLM_HOOKS_STATE = /* @__PURE__ */ Symbol.for("glm.hooks");
function getHookState() {
  const existing = globalThis[GLM_HOOKS_STATE];
  if (existing && typeof existing === "object" && Array.isArray(existing.rules) && Array.isArray(existing.runs)) {
    return existing;
  }
  const state = {
    rules: [],
    runs: []
  };
  globalThis[GLM_HOOKS_STATE] = state;
  return state;
}
function getHookRuntimeStatus() {
  return getHookState().status;
}
function getHookRules() {
  return [...getHookState().rules];
}
function getHookRuns() {
  return [...getHookState().runs];
}
function clearHookRuns() {
  getHookState().runs = [];
}

// resources/extensions/glm-hooks/index.ts
var HOOKS_WIDGET_KEY = "glm.hooks";
var HOOK_CONTEXT_MESSAGE_TYPE = "glm.hooks.inject";
function getHookRunner() {
  const store = globalThis;
  const runner = store[/* @__PURE__ */ Symbol.for("glm.hookRunner")];
  if (!runner || typeof runner.run !== "function") {
    return null;
  }
  return runner;
}
function maybeInjectContext(pi, decision) {
  if (decision.type !== "injectContext") return;
  const content = String(decision.content ?? "").trim();
  if (!content) return;
  pi.sendMessage(
    {
      customType: HOOK_CONTEXT_MESSAGE_TYPE,
      content,
      display: true,
      details: {
        ...decision.reason ? { reason: decision.reason } : {}
      }
    },
    { triggerTurn: false, deliverAs: "steer" }
  );
}
function formatHookStatusLines() {
  const status = getHookRuntimeStatus();
  const rules = getHookRules();
  const runs = getHookRuns();
  const lines = [];
  if (!status) {
    lines.push("Hooks: status unavailable (start or reload a session)");
    return lines;
  }
  lines.push(
    `Hooks: ${status.enabled ? "enabled" : "disabled"} | rules ${status.ruleCount} | timeout ${status.hookTimeoutMs}ms`
  );
  lines.push(`hooks.json: ${status.hooksPath}`);
  if (rules.length) {
    lines.push("Rules:");
    for (const rule of rules.slice(0, 10)) {
      lines.push(
        `- ${rule.id ?? "<anonymous>"} | ${rule.event} | ${rule.handler.backend}`
      );
    }
    if (rules.length > 10) {
      lines.push(`... (${rules.length - 10} more)`);
    }
  } else {
    lines.push("Rules: 0");
  }
  if (runs.length) {
    lines.push(`Recent runs: ${runs.length}`);
    for (const run of runs.slice(-10)) {
      const decision = run.decision ? run.decision.type : "none";
      lines.push(
        `${run.id}. [${run.outcome}] ${run.event} | ${run.ruleId ?? "<anonymous>"} | ${decision} | ${run.durationMs}ms`
      );
    }
  } else {
    lines.push("Recent runs: 0");
  }
  return lines;
}
function index_default(pi) {
  pi.on("session_start", (event, ctx) => {
    const hookRunner = getHookRunner();
    if (!hookRunner) return;
    void hookRunner.run(
      pi,
      {
        name: "sessionStart",
        reason: event?.reason,
        provider: ctx.model?.provider,
        model: ctx.model?.id
      },
      { signal: ctx.signal }
    );
  });
  pi.on("session_shutdown", (_event, ctx) => {
    const hookRunner = getHookRunner();
    if (!hookRunner) return;
    void hookRunner.run(
      pi,
      {
        name: "sessionEnd",
        provider: ctx.model?.provider,
        model: ctx.model?.id
      },
      { signal: ctx.signal }
    );
  });
  pi.on("before_provider_request", async (event, ctx) => {
    const hookRunner = getHookRunner();
    if (!hookRunner) return event.payload;
    const result = await hookRunner.run(
      pi,
      {
        name: "beforeProviderRequest",
        provider: ctx.model?.provider,
        model: ctx.model?.id
      },
      { signal: ctx.signal }
    );
    maybeInjectContext(pi, result.decision ?? { type: "allow" });
    return event.payload;
  });
  pi.on("tool_call", async (event, ctx) => {
    const hookRunner = getHookRunner();
    if (!hookRunner) return;
    const result = await hookRunner.run(
      pi,
      {
        name: "beforeTool",
        provider: ctx.model?.provider,
        model: ctx.model?.id,
        tool: { name: event.toolName, input: event.input }
      },
      { signal: ctx.signal }
    );
    maybeInjectContext(pi, result.decision ?? { type: "allow" });
    if (result.decision?.type === "deny") {
      return { block: true, reason: result.decision.reason ?? "Denied by hook" };
    }
    if (result.decision?.type === "defer") {
      return { block: true, reason: result.decision.reason ?? "Deferred by hook" };
    }
  });
  pi.on("tool_result", async (event, ctx) => {
    const hookRunner = getHookRunner();
    if (!hookRunner) return;
    const result = await hookRunner.run(
      pi,
      {
        name: "afterTool",
        provider: ctx.model?.provider,
        model: ctx.model?.id,
        tool: { name: event.toolName, input: event.input }
      },
      { signal: ctx.signal }
    );
    maybeInjectContext(pi, result.decision ?? { type: "allow" });
  });
  pi.registerCommand("hooks", {
    description: "Show hook configuration and recent hook executions (or clear runs).",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (trimmed === "clear") {
        clearHookRuns();
        appendRuntimeEvent({
          type: "hooks.runs_cleared",
          summary: "Cleared hook run history"
        });
        if (ctx.hasUI) {
          ctx.ui.setWidget(HOOKS_WIDGET_KEY, void 0);
          ctx.ui.notify("Cleared hook runs", "info");
          return;
        }
        pi.sendMessage(
          {
            customType: "glm.hooks",
            content: "Cleared hook runs.",
            display: true,
            details: {}
          },
          { triggerTurn: false, deliverAs: "nextTurn" }
        );
        return;
      }
      const lines = formatHookStatusLines();
      if (ctx.hasUI) {
        ctx.ui.setWidget(HOOKS_WIDGET_KEY, lines, { placement: "belowEditor" });
        ctx.ui.notify("Updated hooks widget", "info");
        return;
      }
      pi.sendMessage(
        {
          customType: "glm.hooks",
          content: lines.join("\n"),
          display: true,
          details: {}
        },
        { triggerTurn: false, deliverAs: "nextTurn" }
      );
    }
  });
}
export {
  index_default as default
};
