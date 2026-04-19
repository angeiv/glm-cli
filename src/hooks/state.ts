import type { HookExecutionRecord, HookRule } from "./types.js";

export type HookRuntimeStatus = {
  enabled: boolean;
  hooksPath: string;
  hookTimeoutMs: number;
  ruleCount: number;
};

const GLM_HOOKS_STATE = Symbol.for("glm.hooks");

type HookState = {
  status?: HookRuntimeStatus;
  rules: HookRule[];
  runs: HookExecutionRecord[];
};

function getHookState(): HookState {
  const existing = (globalThis as Record<PropertyKey, unknown>)[GLM_HOOKS_STATE] as HookState | undefined;
  if (
    existing &&
    typeof existing === "object" &&
    Array.isArray(existing.rules) &&
    Array.isArray(existing.runs)
  ) {
    return existing;
  }

  const state: HookState = {
    rules: [],
    runs: [],
  };
  (globalThis as Record<PropertyKey, unknown>)[GLM_HOOKS_STATE] = state;
  return state;
}

export function setHookRuntimeStatus(status: HookRuntimeStatus): void {
  getHookState().status = status;
}

export function getHookRuntimeStatus(): HookRuntimeStatus | undefined {
  return getHookState().status;
}

export function setHookRules(rules: HookRule[]): void {
  getHookState().rules = rules;
}

export function getHookRules(): HookRule[] {
  return [...getHookState().rules];
}

export function appendHookRun(record: HookExecutionRecord, limit = 50): void {
  const state = getHookState();
  state.runs.push(record);
  if (state.runs.length > limit) {
    state.runs = state.runs.slice(state.runs.length - limit);
  }
}

export function getHookRuns(): HookExecutionRecord[] {
  return [...getHookState().runs];
}

export function clearHookRuns(): void {
  getHookState().runs = [];
}

