import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { resolveRuntimeModelProfile } from "../shared/glm-profile.js";
import { readGlmModelProfileOverrides } from "../shared/glm-user-config.js";

type ContextCacheMode = "auto" | "explicit" | "off";

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
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

function normalizeContextCacheMode(value: unknown): ContextCacheMode {
  if (typeof value !== "string") return "auto";
  const normalized = value.trim().toLowerCase();
  if (normalized === "explicit" || normalized === "off" || normalized === "auto") {
    return normalized;
  }
  return "auto";
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

  // Some providers implicitly enable thinking when a budget is provided.
  if (toFiniteNumber(payload.thinking_budget) !== undefined) {
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
  if (
    thinkingType &&
    thinkingType !== "disabled" &&
    thinkingType !== "none" &&
    thinkingType !== "off"
  ) {
    return true;
  }

  return false;
}

function hasReasoningEffort(payload: Record<string, unknown>): boolean {
  return Object.hasOwn(payload, "reasoning_effort");
}

function resolveMaxCompletionTokens(payload: Record<string, unknown>): number | undefined {
  return (
    toFiniteNumber(payload.max_completion_tokens) ??
    toFiniteNumber(payload.max_tokens) ??
    toFiniteNumber(payload.max_output_tokens)
  );
}

type DashscopePatchContext = {
  /**
   * Max tokens override from the GLM config surface (GLM_MAX_OUTPUT_TOKENS).
   * Useful when a later extension overwrites the max token field after this patch runs.
   */
  maxOutputTokensOverride?: number;
  /**
   * Model-level maxTokens cap from Pi's model registry.
   * Used as a fallback when no max token field is present in the request payload.
   */
  modelMaxTokens?: number;
  /**
   * Explicit context cache mode for DashScope/Bailian. `auto` relies on Bailian's
   * implicit cache; `explicit` injects cache_control markers.
   */
  contextCache?: ContextCacheMode;
  modelId?: string;
  supportsCache?: boolean;
};

function resolveEffectiveMaxCompletionTokens(
  payload: Record<string, unknown>,
  context?: DashscopePatchContext,
): number | undefined {
  const candidates = [
    resolveMaxCompletionTokens(payload),
    context?.maxOutputTokensOverride,
    context?.modelMaxTokens,
  ]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .map((value) => Math.floor(value))
    .filter((value) => value > 0);

  if (candidates.length === 0) {
    return undefined;
  }

  return Math.min(...candidates);
}

export function applyDashscopePayloadPatches(
  payload: unknown,
  context?: DashscopePatchContext,
): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const next = { ...(payload as Record<string, unknown>) };
  let changed = false;

  const maxCompletionTokens = resolveEffectiveMaxCompletionTokens(next, context);
  if (maxCompletionTokens !== undefined && maxCompletionTokens > 0 && isThinkingEnabled(next)) {
    const maxBudget = Math.max(0, Math.floor(maxCompletionTokens) - 1);
    const existingBudget = toFiniteNumber(next.thinking_budget);
    const derivedBudget =
      existingBudget ??
      resolveThinkingBudgetFromReasoningEffort(next.reasoning_effort) ??
      DEFAULT_THINKING_BUDGETS.medium;

    const clampedBudget = Math.min(Math.max(0, Math.floor(derivedBudget)), maxBudget);
    const shouldStripReasoningEffort = hasReasoningEffort(next);
    if (existingBudget !== clampedBudget || shouldStripReasoningEffort) {
      next.thinking_budget = clampedBudget;
      if (shouldStripReasoningEffort) {
        delete next.reasoning_effort;
      }
      changed = true;
    }
  }

  const cachePatched = applyDashscopeExplicitCache(next, context);
  changed = changed || cachePatched;

  return changed ? next : payload;
}

function hasCacheControl(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasCacheControl(item));
  }
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (Object.hasOwn(record, "cache_control")) {
    return true;
  }
  return Object.values(record).some((item) => hasCacheControl(item));
}

function addCacheControlToTextContent(message: Record<string, unknown>): boolean {
  const content = message.content;
  if (typeof content === "string") {
    if (!content.trim()) return false;
    message.content = [
      {
        type: "text",
        text: content,
        cache_control: { type: "ephemeral" },
      },
    ];
    return true;
  }

  if (!Array.isArray(content)) return false;
  for (let index = content.length - 1; index >= 0; index--) {
    const part = content[index];
    if (!part || typeof part !== "object" || Array.isArray(part)) continue;
    const record = part as Record<string, unknown>;
    if (record.type !== "text") continue;
    if (typeof record.text !== "string" || !record.text.trim()) continue;
    record.cache_control = { type: "ephemeral" };
    return true;
  }

  return false;
}

function isReusableCacheMessage(
  message: Record<string, unknown>,
  index: number,
  lastIndex: number,
): boolean {
  const role = typeof message.role === "string" ? message.role : "";
  if (role === "system" || role === "developer") return true;
  // Avoid caching the current user prompt when there is no stable prefix message.
  return index < lastIndex && (role === "user" || role === "assistant" || role === "tool");
}

function supportsDashscopeExplicitCache(context?: DashscopePatchContext): boolean {
  if (context?.contextCache !== "explicit") return false;
  if (context.supportsCache === false) return false;
  if (!context.modelId) return context.supportsCache === true;

  const normalizedModel = context.modelId.trim().toLowerCase();
  return normalizedModel === "glm-5.1" || normalizedModel.endsWith("/glm-5.1");
}

function applyDashscopeExplicitCache(
  payload: Record<string, unknown>,
  context?: DashscopePatchContext,
): boolean {
  if (!supportsDashscopeExplicitCache(context)) return false;
  if (hasCacheControl(payload.messages)) return false;
  if (!Array.isArray(payload.messages)) return false;

  const messages = payload.messages.slice();
  const lastIndex = messages.length - 1;
  for (let index = 0; index < messages.length; index++) {
    const rawMessage = messages[index];
    if (!rawMessage || typeof rawMessage !== "object" || Array.isArray(rawMessage)) continue;
    const message = { ...(rawMessage as Record<string, unknown>) };
    if (!isReusableCacheMessage(message, index, lastIndex)) continue;
    if (!addCacheControlToTextContent(message)) continue;

    messages[index] = message;
    payload.messages = messages;
    return true;
  }

  return false;
}

export default function (pi: ExtensionAPI) {
  const modelProfileOverrides = readGlmModelProfileOverrides();
  const contextCache = normalizeContextCacheMode(process.env.GLM_CONTEXT_CACHE);

  pi.on("before_provider_request", (event, ctx) => {
    const model = (ctx.model ?? {}) as {
      baseUrl?: string;
      id?: string;
      maxTokens?: number;
      provider?: string;
      upstreamProvider?: string;
    };
    const baseUrl = typeof model.baseUrl === "string" ? model.baseUrl : "";

    if (!baseUrl) {
      return;
    }

    const maxOutputTokensOverride = toFiniteNumber(process.env.GLM_MAX_OUTPUT_TOKENS);
    const modelMaxTokens = toFiniteNumber(model.maxTokens);
    const modelId = typeof model.id === "string" ? model.id : undefined;
    const profile = modelId
      ? resolveRuntimeModelProfile({
          provider: model.provider,
          modelId,
          baseUrl,
          upstreamProvider: model.upstreamProvider,
          overrides: modelProfileOverrides,
        })
      : undefined;

    if (profile) {
      if (!profile.patchPipeline.dashscopeCompat) {
        return;
      }
    } else if (!isDashscopeBaseUrl(baseUrl)) {
      return;
    }

    return applyDashscopePayloadPatches(event.payload, {
      ...(maxOutputTokensOverride === undefined ? {} : { maxOutputTokensOverride }),
      ...(modelMaxTokens === undefined ? {} : { modelMaxTokens }),
      contextCache,
      ...(modelId === undefined ? {} : { modelId }),
      ...(profile === undefined ? {} : { supportsCache: profile.effectiveCaps.supportsCache }),
    });
  });
}
