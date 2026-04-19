import { appendRuntimeEvent } from "../diagnostics/event-log.js";
import { setHookRules, setHookRuntimeStatus } from "./state.js";
import { readHookFile } from "./registry.js";
import type { HookRuntimeStatus } from "./state.js";
import { HookRunner } from "./runner.js";

export async function loadHooks(args: {
  enabled: boolean;
  hooksPath: string;
  hookTimeoutMs: number;
}): Promise<HookRuntimeStatus> {
  const config = args.enabled ? await readHookFile(args.hooksPath) : null;
  const rules = config?.hooks ?? [];

  setHookRules(rules);
  const runner = getSessionHookRunner();
  runner.options.enabled = args.enabled;
  runner.options.hookTimeoutMs = args.hookTimeoutMs;
  runner.setRules(rules);

  const status: HookRuntimeStatus = {
    enabled: args.enabled,
    hooksPath: args.hooksPath,
    hookTimeoutMs: args.hookTimeoutMs,
    ruleCount: rules.length,
  };
  setHookRuntimeStatus(status);

  appendRuntimeEvent({
    type: "hooks.loaded",
    summary: args.enabled
      ? `Loaded ${rules.length} hook rule(s) from ${args.hooksPath}`
      : "Hooks are disabled",
    details: {
      enabled: args.enabled,
      hooksPath: args.hooksPath,
      hookTimeoutMs: args.hookTimeoutMs,
      ruleCount: rules.length,
    },
  });

  return status;
}

export function getSessionHookRunner(): HookRunner {
  const key = Symbol.for("glm.hookRunner");
  const store = globalThis as Record<PropertyKey, unknown>;
  const existing = store[key] as HookRunner | undefined;
  if (existing) return existing;

  const runner = new HookRunner({ enabled: false, hookTimeoutMs: 5000 });
  store[key] = runner;
  return runner;
}
