import type { ExecOptions, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type {
  HookDecision,
  HookExecutionRecord,
  HookEventName,
  HookFile,
  HookRule,
} from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

function createExecutionId(): string {
  // Avoid bringing in a uuid dependency for now.
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function matchString(expected: string | undefined, actual: string | undefined): boolean {
  if (!expected) return true;
  return expected === (actual ?? "");
}

function matchCommandPrefix(prefix: string | undefined, command: string | undefined): boolean {
  if (!prefix) return true;
  if (!command) return false;
  return command.trim().startsWith(prefix);
}

export type HookEventContext = {
  name: HookEventName;
  reason?: string;
  provider?: string;
  model?: string;
  tool?: {
    name: string;
    input?: Record<string, unknown>;
  };
};

export type HookRunnerOptions = {
  enabled: boolean;
  hooksPath: string;
  hookTimeoutMs: number;
};

export type HookRunnerState = {
  config: HookFile | null;
  runs: HookExecutionRecord[];
};

export type HookRunResult = {
  decision: HookDecision;
  matchedRuleIds: string[];
};

function parseDecisionFromText(text: string): HookDecision | null {
  // Simple line-based protocol:
  // - allow
  // - deny: reason...
  // - defer: reason...
  // - injectContext: reason... \n <content...>
  const trimmed = text.trim();
  if (!trimmed) return null;

  const [firstLine, ...rest] = trimmed.split(/\r?\n/);
  const lower = firstLine.trim().toLowerCase();

  if (lower === "allow") return { type: "allow" };
  if (lower === "deny") return { type: "deny" };
  if (lower.startsWith("deny:")) {
    return { type: "deny", reason: firstLine.slice(firstLine.indexOf(":") + 1).trim() };
  }
  if (lower === "defer") return { type: "defer" };
  if (lower.startsWith("defer:")) {
    return { type: "defer", reason: firstLine.slice(firstLine.indexOf(":") + 1).trim() };
  }

  if (lower === "injectcontext") {
    return { type: "injectContext", content: rest.join("\n").trim() };
  }
  if (lower.startsWith("injectcontext:")) {
    const reason = firstLine.slice(firstLine.indexOf(":") + 1).trim();
    return { type: "injectContext", reason, content: rest.join("\n").trim() };
  }

  return null;
}

async function runRuleHandler(
  pi: Pick<ExtensionAPI, "exec">,
  rule: HookRule,
  payload: Record<string, unknown>,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<HookDecision | null> {
  if (rule.handler.backend === "command") {
    const shell = process.env.SHELL || "/bin/sh";
    const handlerPayload = JSON.stringify(payload);
    const cmd = rule.handler.command;

    const execOptions: ExecOptions = {
      cwd: process.cwd(),
      timeout: options.timeoutMs,
      signal: options.signal,
    };

    const result = await pi.exec(shell, ["-lc", cmd], {
      ...execOptions,
      // Pass hook payload to the command via env var, to avoid quoting problems.
      // Note: pi.exec does not expose env overrides today, so we fall back to stdin-like pattern:
      // users can reference $GLM_HOOK_PAYLOAD via the parent process env if needed.
    });

    // Best-effort: many commands will print to stdout; interpret stdout as decision.
    const combined = `${result.stdout}\n${result.stderr}`.trim();
    const decision = parseDecisionFromText(combined);
    return decision;
  }

  const url = rule.handler.url;
  const method = rule.handler.method ?? "POST";
  const res = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...(rule.handler.headers ?? {}),
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(payload) }),
    signal: options.signal,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${text}`.trim());
  }

  const decision = parseDecisionFromText(text);
  if (decision) return decision;

  // Also support JSON { decision: "...", ... }.
  try {
    const parsed = JSON.parse(text) as any;
    const type = String(parsed?.decision ?? parsed?.type ?? "").trim();
    if (type === "allow") return { type: "allow" };
    if (type === "deny") return { type: "deny", reason: isNonEmptyString(parsed?.reason) ? parsed.reason : undefined };
    if (type === "defer") return { type: "defer", reason: isNonEmptyString(parsed?.reason) ? parsed.reason : undefined };
    if (type === "injectContext" && isNonEmptyString(parsed?.content)) {
      return { type: "injectContext", content: parsed.content, reason: isNonEmptyString(parsed?.reason) ? parsed.reason : undefined };
    }
  } catch {
    // ignore
  }

  return null;
}

function buildHookPayload(event: HookEventContext): Record<string, unknown> {
  return {
    event: event.name,
    ...(event.reason ? { reason: event.reason } : {}),
    ...(event.provider ? { provider: event.provider } : {}),
    ...(event.model ? { model: event.model } : {}),
    ...(event.tool
      ? {
          tool: {
            name: event.tool.name,
            input: event.tool.input ?? {},
          },
        }
      : {}),
  };
}

function isRuleMatch(rule: HookRule, event: HookEventContext): boolean {
  if (rule.event !== event.name) return false;
  const match = rule.match;
  if (!match) return true;

  if (!matchString(match.provider, event.provider)) return false;
  if (!matchString(match.model, event.model)) return false;
  if (!matchString(match.reason, event.reason)) return false;

  if (match.tool && match.tool !== event.tool?.name) return false;
  if (match.commandPrefix && !matchCommandPrefix(match.commandPrefix, String(event.tool?.input?.command ?? ""))) {
    return false;
  }

  return true;
}

export class HookRunner {
  readonly state: HookRunnerState;
  readonly options: HookRunnerOptions;

  constructor(options: HookRunnerOptions) {
    this.options = options;
    this.state = {
      config: null,
      runs: [],
    };
  }

  setConfig(config: HookFile | null): void {
    this.state.config = config;
  }

  recordRun(record: HookExecutionRecord, limit = 50): void {
    this.state.runs.push(record);
    if (this.state.runs.length > limit) {
      this.state.runs = this.state.runs.slice(this.state.runs.length - limit);
    }
  }

  listRules(): HookRule[] {
    return this.state.config?.hooks ?? [];
  }

  async run(
    pi: Pick<ExtensionAPI, "exec">,
    event: HookEventContext,
    args?: { signal?: AbortSignal },
  ): Promise<HookRunResult> {
    if (!this.options.enabled) {
      return { decision: { type: "allow" }, matchedRuleIds: [] };
    }

    const rules = this.listRules();
    if (rules.length === 0) {
      return { decision: { type: "allow" }, matchedRuleIds: [] };
    }

    let finalDecision: HookDecision = { type: "allow" };
    const matchedRuleIds: string[] = [];
    const payload = buildHookPayload(event);

    for (const rule of rules) {
      if (!isRuleMatch(rule, event)) {
        continue;
      }

      const startedAt = Date.now();
      const executionId = createExecutionId();
      const ruleId = rule.id;
      matchedRuleIds.push(ruleId ?? "<anonymous>");

      try {
        const timeoutMs = rule.timeoutMs ?? this.options.hookTimeoutMs;
        const decision = await runRuleHandler(pi, rule, payload, { timeoutMs, signal: args?.signal });
        const durationMs = Date.now() - startedAt;

        if (!decision) {
          this.recordRun({
            id: executionId,
            at: nowIso(),
            event: event.name,
            ...(ruleId ? { ruleId } : {}),
            outcome: "matched",
            durationMs,
            decision: { type: "allow" },
          });
          continue;
        }

        this.recordRun({
          id: executionId,
          at: nowIso(),
          event: event.name,
          ...(ruleId ? { ruleId } : {}),
          outcome: "matched",
          durationMs,
          decision,
        });

        // Deterministic last-match-wins.
        finalDecision = decision;
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        const message = error instanceof Error ? error.message : String(error);
        this.recordRun({
          id: executionId,
          at: nowIso(),
          event: event.name,
          ...(ruleId ? { ruleId } : {}),
          outcome: "error",
          durationMs,
          error: message,
        });
      }
    }

    return { decision: finalDecision, matchedRuleIds };
  }
}

