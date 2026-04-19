export type HookEventName =
  | "sessionStart"
  | "beforeTool"
  | "afterTool"
  | "permissionRequest"
  | "beforeProviderRequest"
  | "sessionEnd";

export type HookBackend = "command" | "http";

export type HookDecisionType = "allow" | "deny" | "defer" | "injectContext";

export type HookMatcher = {
  tool?: string;
  commandPrefix?: string;
  provider?: string;
  model?: string;
  reason?: string;
};

export type HookCommandHandler = {
  backend: "command";
  command: string;
};

export type HookHttpHandler = {
  backend: "http";
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
};

export type HookHandler = HookCommandHandler | HookHttpHandler;

export type HookRule = {
  id?: string;
  event: HookEventName;
  match?: HookMatcher;
  handler: HookHandler;
  /**
   * If provided, overrides the default runner timeout for this hook.
   */
  timeoutMs?: number;
};

export type HookFile = {
  version?: number;
  hooks: HookRule[];
};

export type HookDecision =
  | { type: "allow" }
  | { type: "deny"; reason?: string }
  | { type: "defer"; reason?: string }
  | { type: "injectContext"; content: string; reason?: string };

export type HookExecutionRecord = {
  id: string;
  at: string;
  event: HookEventName;
  ruleId?: string;
  outcome: "matched" | "skipped" | "timeout" | "error";
  durationMs: number;
  decision?: HookDecision;
  error?: string;
};

