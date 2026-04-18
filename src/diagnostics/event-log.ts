import type { RuntimeEvent, RuntimeEventLevel } from "./types.js";

type RuntimeEventLogState = {
  limit: number;
  nextId: number;
  events: RuntimeEvent[];
};

const GLM_EVENT_LOG_STATE = Symbol.for("glm.eventLog");

function getRuntimeEventLogState(): RuntimeEventLogState {
  const existing = (globalThis as Record<PropertyKey, unknown>)[GLM_EVENT_LOG_STATE] as
    | RuntimeEventLogState
    | undefined;

  if (
    existing &&
    typeof existing.limit === "number" &&
    typeof existing.nextId === "number" &&
    Array.isArray(existing.events)
  ) {
    return existing;
  }

  const state: RuntimeEventLogState = {
    limit: 200,
    nextId: 1,
    events: [],
  };
  (globalThis as Record<PropertyKey, unknown>)[GLM_EVENT_LOG_STATE] = state;
  return state;
}

export function configureRuntimeEventLog(args: { limit: number }): void {
  const state = getRuntimeEventLogState();
  state.limit = Number.isInteger(args.limit) && args.limit > 0 ? args.limit : 200;
  if (state.events.length > state.limit) {
    state.events = state.events.slice(state.events.length - state.limit);
  }
}

export function appendRuntimeEvent(args: {
  type: string;
  summary: string;
  level?: RuntimeEventLevel;
  details?: Record<string, unknown>;
}): RuntimeEvent {
  const state = getRuntimeEventLogState();
  const event: RuntimeEvent = {
    id: state.nextId++,
    at: new Date().toISOString(),
    type: args.type,
    summary: args.summary,
    level: args.level ?? "info",
    ...(args.details ? { details: args.details } : {}),
  };

  state.events.push(event);
  if (state.events.length > state.limit) {
    state.events = state.events.slice(state.events.length - state.limit);
  }

  return event;
}

export function getRuntimeEvents(): RuntimeEvent[] {
  return [...getRuntimeEventLogState().events];
}

export function clearRuntimeEvents(): void {
  const state = getRuntimeEventLogState();
  state.events = [];
}
