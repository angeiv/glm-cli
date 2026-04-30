import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  if (!Number.isFinite(value)) return undefined;
  return value;
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function getObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export function isDashscopeBaseUrl(baseUrl: string): boolean {
  const trimmed = baseUrl.trim();
  if (!trimmed) return false;

  const parse = (value: string): URL | null => {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  };

  const url = parse(trimmed) ?? parse(`https://${trimmed}`);
  if (!url) return false;

  const host = url.hostname.trim().toLowerCase();
  // Match on hostname (not substring) to avoid accepting attacker-controlled domains.
  return host === "dashscope.aliyuncs.com" || host === "bailian.aliyuncs.com";
}

const DEFAULT_THINKING_BUDGETS: Record<string, number> = {
  minimal: 1024,
  low: 2048,
  medium: 8192,
  high: 16384,
  // Some providers advertise/support xhigh effort but enforce token budgets. Use a generous
  // default and clamp based on max tokens.
  xhigh: 32768,
};

function resolveThinkingBudgetFromReasoningEffort(value: unknown): number | undefined {
  const effort = toStringValue(value)?.toLowerCase();
  if (!effort) return undefined;

  if (effort === "none" || effort === "disabled" || effort === "off") {
    return 0;
  }

  return DEFAULT_THINKING_BUDGETS[effort];
}

function isThinkingEnabled(payload: Record<string, unknown>): boolean {
  const reasoningEffort = toStringValue(payload.reasoning_effort)?.toLowerCase();
  if (
    reasoningEffort &&
    reasoningEffort !== "none" &&
    reasoningEffort !== "disabled" &&
    reasoningEffort !== "off"
  ) {
    return true;
  }

  if (payload.enable_thinking === true) {
    return true;
  }

  const chatTemplate = getObject(payload.chat_template_kwargs);
  if (chatTemplate?.enable_thinking === true) {
    return true;
  }

  const thinking = getObject(payload.thinking);
  const thinkingType = toStringValue(thinking?.type)?.toLowerCase();
  if (thinkingType && thinkingType !== "disabled" && thinkingType !== "none" && thinkingType !== "off") {
    return true;
  }

  return false;
}

function resolveMaxCompletionTokens(payload: Record<string, unknown>): number | undefined {
  return (
    toFiniteNumber(payload.max_completion_tokens) ??
    toFiniteNumber(payload.max_tokens) ??
    toFiniteNumber(payload.max_output_tokens)
  );
}

export function applyDashscopePayloadPatches(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const next = { ...(payload as Record<string, unknown>) };

  const maxCompletionTokens = resolveMaxCompletionTokens(next);
  if (maxCompletionTokens === undefined) return payload;
  if (maxCompletionTokens <= 0) return payload;

  if (!isThinkingEnabled(next)) {
    return payload;
  }

  const maxBudget = Math.max(0, Math.floor(maxCompletionTokens) - 1);
  const existingBudget = toFiniteNumber(next.thinking_budget);
  const derivedBudget =
    existingBudget ??
    resolveThinkingBudgetFromReasoningEffort(next.reasoning_effort) ??
    DEFAULT_THINKING_BUDGETS.medium;

  const clampedBudget = Math.min(Math.max(0, Math.floor(derivedBudget)), maxBudget);
  if (existingBudget === clampedBudget) {
    return payload;
  }

  next.thinking_budget = clampedBudget;
  return next;
}

export default function (pi: ExtensionAPI) {
  pi.on("before_provider_request", (event, ctx) => {
    const model = (ctx.model ?? {}) as { baseUrl?: string };
    const baseUrl = typeof model.baseUrl === "string" ? model.baseUrl : "";

    if (!baseUrl || !isDashscopeBaseUrl(baseUrl)) {
      return;
    }

    return applyDashscopePayloadPatches(event.payload);
  });
}
