const GLM_EVENT_LOG_STATE = Symbol.for("glm.eventLog");
const GLM_RUNTIME_STATUS = Symbol.for("glm.runtimeStatus");

function getRuntimeEventLogState() {
  const existing = globalThis[GLM_EVENT_LOG_STATE];
  if (
    existing &&
    typeof existing === "object" &&
    typeof existing.limit === "number" &&
    typeof existing.nextId === "number" &&
    Array.isArray(existing.events)
  ) {
    return existing;
  }

  const state = {
    limit: 200,
    nextId: 1,
    events: [],
  };
  globalThis[GLM_EVENT_LOG_STATE] = state;
  return state;
}

export function appendRuntimeEvent({
  type,
  summary,
  level = "info",
  details,
}) {
  const state = getRuntimeEventLogState();
  const event = {
    id: state.nextId++,
    at: new Date().toISOString(),
    type,
    summary,
    level,
    ...(details ? { details } : {}),
  };
  state.events.push(event);
  if (state.events.length > state.limit) {
    state.events = state.events.slice(state.events.length - state.limit);
  }
  return event;
}

export function getRuntimeEvents() {
  return [...getRuntimeEventLogState().events];
}

export function clearRuntimeEvents() {
  getRuntimeEventLogState().events = [];
}

export function getRuntimeStatus() {
  const store = globalThis[GLM_RUNTIME_STATUS];
  const status = store && typeof store === "object" ? store.status : undefined;
  if (!status || typeof status !== "object") {
    return undefined;
  }

  return {
    ...status,
    diagnostics: {
      ...status.diagnostics,
      eventCount: getRuntimeEvents().length,
    },
  };
}

export function buildRuntimeStatusLines(status) {
  const verifier = status.loop.verifyCommand
    ? status.loop.verifyCommand
    : status.loop.verifyFallbackCommand
      ? `auto-detect (fallback: ${status.loop.verifyFallbackCommand})`
      : "auto-detect";

  return [
    `Cwd: ${status.cwd}`,
    `Provider: ${status.provider}`,
    `Model: ${status.model}`,
    `Resolved: canonical=${status.resolvedModel?.canonicalModelId ?? "none"} | platform=${status.resolvedModel?.platform ?? "unknown"} | upstream=${status.resolvedModel?.upstreamVendor ?? "unknown"} | patch=${status.resolvedModel?.payloadPatchPolicy ?? "safe-openai-compatible"} | confidence=${status.resolvedModel?.confidence ?? "low"}`,
    status.resolvedModel?.contextWindow
      ? `Model caps: contextWindow=${status.resolvedModel.contextWindow} | maxOutputTokens=${status.resolvedModel.maxOutputTokens}`
      : "Model caps: unknown",
    `Approval policy: ${status.approvalPolicy}`,
    `Loop: ${status.loop.enabled ? "on" : "off"} | ${status.loop.profile} | rounds ${status.loop.maxRounds} | fail ${status.loop.failureMode}`,
    status.compaction
      ? `Compaction: ${status.compaction.enabled ? "on" : "off"} | reserve=${status.compaction.reserveTokens} | keepRecent=${status.compaction.keepRecentTokens}`
      : "Compaction: status unavailable",
    `Verifier: ${verifier}`,
    `Notifications: ${status.notifications?.enabled ? "on" : "off"} | turnEnd ${status.notifications?.onTurnEnd ? "on" : "off"} | loopResult ${status.notifications?.onLoopResult ? "on" : "off"}`,
    `MCP: ${status.mcp.enabled ? "enabled" : "disabled"} | servers ${status.mcp.configuredServerCount} | direct ${status.mcp.modeCounts?.direct ?? 0} | proxy ${status.mcp.modeCounts?.proxy ?? 0} | hybrid ${status.mcp.modeCounts?.hybrid ?? 0}`,
    status.verification?.latest
      ? `Verification: ${status.verification.latest.scenario ? `${status.verification.latest.scenario} | ` : ""}${status.verification.latest.kind} | ${status.verification.latest.command ?? "no command"} | ${status.verification.latest.summary} | ${status.verification.latest.artifactPath}`
      : "Verification: none",
    `Diagnostics: debugRuntime=${status.diagnostics.debugRuntime} | eventLogLimit=${status.diagnostics.eventLogLimit} | events=${status.diagnostics.eventCount}`,
    `Session dir: ${status.paths.sessionDir}`,
  ];
}

export function buildRuntimeEventLines(events) {
  if (!events.length) {
    return [
      "Recent events: 0",
      "No runtime events recorded in this session yet.",
    ];
  }

  return [
    `Recent events: ${events.length}`,
    ...events.map(
      (event) => `${event.id}. [${event.level}] ${event.type} | ${event.summary}`,
    ),
  ];
}
