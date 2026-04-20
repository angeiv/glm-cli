import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { appendRuntimeEvent } from "../diagnostics/event-log.js";
import { appendHookRun } from "./state.js";
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

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
  // Line-based protocol:
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
    return {
      type: "deny",
      reason: normalizeString(firstLine.slice(firstLine.indexOf(":") + 1)),
    };
  }
  if (lower === "defer") return { type: "defer" };
  if (lower.startsWith("defer:")) {
    return {
      type: "defer",
      reason: normalizeString(firstLine.slice(firstLine.indexOf(":") + 1)),
    };
  }

  if (lower === "injectcontext") {
    return { type: "injectContext", content: rest.join("\n").trim() };
  }
  if (lower.startsWith("injectcontext:")) {
    return {
      type: "injectContext",
      reason: normalizeString(firstLine.slice(firstLine.indexOf(":") + 1)),
      content: rest.join("\n").trim(),
    };
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
  if (
    match.commandPrefix &&
    !matchCommandPrefix(
      match.commandPrefix,
      normalizeString(event.tool?.input?.command),
    )
  ) {
    return false;
  }

  return true;
}

function createHookEnv(payload: Record<string, unknown>): Record<string, string> {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8").toString("base64");
  return {
    GLM_HOOK_PAYLOAD_B64: b64,
  };
}

function shellEscapeSingleQuoted(value: string): string {
  // POSIX-safe single-quote escaping: close, escape, reopen.
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

async function execCommandWithEnv(
  pi: Pick<ExtensionAPI, "exec">,
  command: string,
  options: { timeoutMs: number; signal?: AbortSignal },
  env: Record<string, string>,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const shell = process.env.SHELL || "/bin/sh";
  const envExports = Object.entries(env)
    .map(([key, value]) => `${key}=${shellEscapeSingleQuoted(value)}`)
    .join(" ");
  const fullCommand = envExports ? `${envExports} ${command}` : command;

  const result = await pi.exec(shell, ["-lc", fullCommand], {
    cwd: process.cwd(),
    timeout: options.timeoutMs,
    signal: options.signal,
  });

  return result;
}

async function runRuleHandler(
  pi: Pick<ExtensionAPI, "exec">,
  rule: HookRule,
  payload: Record<string, unknown>,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<HookDecision | null> {
  if (rule.handler.backend === "command") {
    const env = createHookEnv(payload);
    const result = await execCommandWithEnv(
      pi,
      rule.handler.command,
      options,
      env,
    );

    const combined = `${result.stdout}\n${result.stderr}`.trim();
    return parseDecisionFromText(combined);
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

  try {
    const parsed = JSON.parse(text) as any;
    const type = normalizeString(parsed?.decision ?? parsed?.type);
    if (type === "allow") return { type: "allow" };
    if (type === "deny") return { type: "deny", reason: normalizeString(parsed?.reason) };
    if (type === "defer") return { type: "defer", reason: normalizeString(parsed?.reason) };
    if (type === "injectContext" && normalizeString(parsed?.content)) {
      return {
        type: "injectContext",
        content: String(parsed.content),
        reason: normalizeString(parsed?.reason),
      };
    }
  } catch {
    // ignore
  }

  return null;
}

export class HookRunner {
  readonly state: HookRunnerState;
  readonly options: HookRunnerOptions;

  constructor(options: HookRunnerOptions) {
    // Options are mutable so we can update them on session (re)load without
    // re-instantiating the runner shared with extensions.
    this.options = { ...options };
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

    appendHookRun(record, limit);

    appendRuntimeEvent({
      type: "hooks.run",
      summary: `${record.event} | ${record.ruleId ?? "<anonymous>"} | ${record.outcome}`,
      ...(record.decision ? { details: { decision: record.decision } } : {}),
    });
  }

  listRules(): HookRule[] {
    return this.state.config?.hooks ?? [];
  }

  setRules(rules: HookRule[]): void {
    this.state.config = { hooks: rules };
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
        const decision = await runRuleHandler(pi, rule, payload, {
          timeoutMs,
          signal: args?.signal,
        });
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
