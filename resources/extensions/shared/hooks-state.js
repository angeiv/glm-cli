const GLM_HOOKS_STATE = Symbol.for("glm.hooks");

function getHookState() {
  const existing = globalThis[GLM_HOOKS_STATE];
  if (
    existing &&
    typeof existing === "object" &&
    Array.isArray(existing.rules) &&
    Array.isArray(existing.runs)
  ) {
    return existing;
  }

  const state = {
    rules: [],
    runs: [],
  };
  globalThis[GLM_HOOKS_STATE] = state;
  return state;
}

export function getHookRuntimeStatus() {
  return getHookState().status;
}

export function getHookRules() {
  return [...getHookState().rules];
}

export function getHookRuns() {
  return [...getHookState().runs];
}

export function clearHookRuns() {
  getHookState().runs = [];
}

