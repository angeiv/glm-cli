import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { appendRuntimeEvent, getRuntimeStatus } from "../shared/runtime-state.js";

type ProviderModelInfo = {
  provider?: string;
  id?: string;
  api?: string;
  baseUrl?: string;
  compat?: Record<string, unknown>;
};

type ThinkingModelInfo = {
  reasoning?: boolean;
  thinkingLevelMap?: Record<string, string | null>;
};

type ProviderResponseSnapshot = {
  status?: number;
  requestId?: string;
  cacheStatus?: string;
  routedModel?: string;
};

const THINKING_STATUS_KEY = "glm.thinking";
const OBSERVE_RESPONSE_STATE = Symbol.for("glm.observe.lastProviderResponse");

function toBoolean(value: unknown): boolean | undefined {
  if (value === true) return true;
  if (value === false) return false;
  return undefined;
}

function toNumber(value: unknown): number | undefined {
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

function hasStrictToolDefinitions(tools: unknown): boolean {
  if (!Array.isArray(tools)) return false;
  for (const tool of tools) {
    const toolObj = getObject(tool);
    const fn = getObject(toolObj?.function);
    if (fn && Object.hasOwn(fn, "strict")) {
      return true;
    }
  }
  return false;
}

function pickResponseFormatType(payload: Record<string, unknown>): string | undefined {
  const responseFormat = getObject(payload.response_format);
  const type = toStringValue(responseFormat?.type);
  return type;
}

function pickThinking(payload: Record<string, unknown>): {
  type?: string;
  clearThinking?: boolean;
  budget?: number;
} {
  const thinking = getObject(payload.thinking);
  return {
    ...(toStringValue(thinking?.type) ? { type: toStringValue(thinking?.type) } : {}),
    ...(toBoolean(thinking?.clear_thinking) === undefined
      ? {}
      : { clearThinking: toBoolean(thinking?.clear_thinking)! }),
    ...(toNumber(payload.thinking_budget) === undefined
      ? {}
      : { budget: toNumber(payload.thinking_budget)! }),
  };
}

function pickMaxTokens(payload: Record<string, unknown>): {
  maxTokens?: number;
  maxOutputTokens?: number;
  maxCompletionTokens?: number;
} {
  const maxTokens = toNumber(payload.max_tokens);
  const maxOutputTokens = toNumber(payload.max_output_tokens);
  const maxCompletionTokens = toNumber(payload.max_completion_tokens);

  return {
    ...(maxTokens === undefined ? {} : { maxTokens }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    ...(maxCompletionTokens === undefined ? {} : { maxCompletionTokens }),
  };
}

function setStatusText(
  ctx: { hasUI?: boolean; ui?: { setStatus?: (key: string, text: string | undefined) => void } },
  key: string,
  text: string | undefined,
): void {
  if (!ctx.hasUI) return;
  const setStatus = ctx.ui?.setStatus;
  if (typeof setStatus === "function") {
    setStatus(key, text);
  }
}

function getSupportedThinkingLevels(model: ThinkingModelInfo | undefined): string[] {
  if (!model?.reasoning) {
    return ["off"];
  }

  const levels = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
  return levels.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    if (level === "xhigh") return mapped !== undefined;
    return true;
  });
}

function formatThinkingStatus(level: string, model: ThinkingModelInfo | undefined): string {
  const supported = getSupportedThinkingLevels(model);
  return `thinking: ${level} [${supported.join("/")}]`;
}

function getResponseStateStore(): { latest?: ProviderResponseSnapshot } {
  const store = globalThis as Record<PropertyKey, unknown>;
  const existing = store[OBSERVE_RESPONSE_STATE];
  if (existing && typeof existing === "object") {
    return existing as { latest?: ProviderResponseSnapshot };
  }

  const next: { latest?: ProviderResponseSnapshot } = {};
  store[OBSERVE_RESPONSE_STATE] = next;
  return next;
}

function clearLatestProviderResponse(): void {
  delete getResponseStateStore().latest;
}

function setLatestProviderResponse(snapshot: ProviderResponseSnapshot): void {
  getResponseStateStore().latest = snapshot;
}

function takeLatestProviderResponse(): ProviderResponseSnapshot | undefined {
  const store = getResponseStateStore();
  const latest = store.latest;
  delete store.latest;
  return latest;
}

function getHeaderValue(headers: unknown, names: string[]): string | undefined {
  if (!headers) return undefined;

  for (const name of names) {
    if (typeof (headers as Headers).get === "function") {
      const value = (headers as Headers).get(name);
      if (value) return value;
    }

    if (typeof headers === "object" && !Array.isArray(headers)) {
      const record = headers as Record<string, unknown>;
      const matched = Object.entries(record).find(([key]) => key.toLowerCase() === name);
      if (matched && typeof matched[1] === "string" && matched[1].trim()) {
        return matched[1];
      }
    }
  }

  return undefined;
}

function buildProviderResponseSnapshot(event: {
  status?: number;
  headers?: unknown;
}): ProviderResponseSnapshot {
  return {
    ...(event.status === undefined ? {} : { status: event.status }),
    ...(getHeaderValue(event.headers, ["x-request-id", "request-id", "anthropic-request-id"])
      ? {
          requestId: getHeaderValue(event.headers, [
            "x-request-id",
            "request-id",
            "anthropic-request-id",
          ]),
        }
      : {}),
    ...(getHeaderValue(event.headers, ["x-cache", "cf-cache-status", "x-cache-status"])
      ? {
          cacheStatus: getHeaderValue(event.headers, [
            "x-cache",
            "cf-cache-status",
            "x-cache-status",
          ]),
        }
      : {}),
    ...(getHeaderValue(event.headers, [
      "x-routed-model",
      "openai-model",
      "x-model",
      "x-upstream-model",
    ])
      ? {
          routedModel: getHeaderValue(event.headers, [
            "x-routed-model",
            "openai-model",
            "x-model",
            "x-upstream-model",
          ]),
        }
      : {}),
  };
}

function summarizeProviderResponse(args: {
  snapshot: ProviderResponseSnapshot;
  message: Record<string, unknown>;
  requestedModel?: string;
}): string {
  const parts = [
    `status=${args.snapshot.status ?? "unknown"}`,
    args.snapshot.requestId ? `request_id=${args.snapshot.requestId}` : undefined,
    args.snapshot.cacheStatus ? `cache=${args.snapshot.cacheStatus}` : undefined,
    args.snapshot.routedModel ? `routed=${args.snapshot.routedModel}` : undefined,
    args.requestedModel ? `requested=${args.requestedModel}` : undefined,
    typeof args.message.model === "string" ? `message_model=${args.message.model}` : undefined,
  ].filter(Boolean);

  return parts.join(" | ");
}

function renderRequestSummary(args: {
  model: ProviderModelInfo;
  payload: Record<string, unknown>;
  toolCount: number;
  toolStream: boolean | undefined;
  thinking: { type?: string; clearThinking?: boolean; budget?: number };
  responseFormatType: string | undefined;
  maxTokens: { maxTokens?: number; maxOutputTokens?: number; maxCompletionTokens?: number };
}): string {
  const provider = args.model.provider ?? "unknown";
  const modelId = args.model.id ?? "unknown";
  const api = args.model.api ?? "unknown";
  const stream = args.payload.stream === true ? "on" : "off";

  const parts = [
    `${provider}/${modelId}`,
    `api=${api}`,
    `stream=${stream}`,
    `tools=${args.toolCount}`,
    args.toolStream === undefined ? undefined : `tool_stream=${args.toolStream ? "on" : "off"}`,
    args.thinking.type ? `thinking=${args.thinking.type}` : undefined,
    args.thinking.clearThinking === undefined
      ? undefined
      : `clear_thinking=${args.thinking.clearThinking ? "on" : "off"}`,
    args.thinking.budget === undefined ? undefined : `thinking_budget=${args.thinking.budget}`,
    args.responseFormatType ? `response_format=${args.responseFormatType}` : undefined,
    args.maxTokens.maxTokens !== undefined ? `max_tokens=${args.maxTokens.maxTokens}` : undefined,
    args.maxTokens.maxOutputTokens !== undefined
      ? `max_output_tokens=${args.maxTokens.maxOutputTokens}`
      : undefined,
    args.maxTokens.maxCompletionTokens !== undefined
      ? `max_completion_tokens=${args.maxTokens.maxCompletionTokens}`
      : undefined,
  ].filter(Boolean);

  return parts.join(" | ");
}

export default function (pi: ExtensionAPI) {
  pi.on("before_provider_request", (event, ctx) => {
    clearLatestProviderResponse();

    const status = getRuntimeStatus();
    if (!status?.diagnostics?.debugRuntime) {
      return;
    }

    const model = (ctx.model ?? {}) as ProviderModelInfo;
    const payloadObj = getObject(event.payload);
    if (!payloadObj) {
      return;
    }

    // Avoid leaking prompt/content. Only capture request-shaping fields.
    const toolCount = Array.isArray(payloadObj.tools) ? payloadObj.tools.length : 0;
    const toolStream = toBoolean(payloadObj.tool_stream);
    const thinking = pickThinking(payloadObj);
    const responseFormatType = pickResponseFormatType(payloadObj);
    const maxTokens = pickMaxTokens(payloadObj);
    const temperature = toNumber(payloadObj.temperature);
    const topP = toNumber(payloadObj.top_p);
    const reasoningEffort = toStringValue(payloadObj.reasoning_effort);

    appendRuntimeEvent({
      type: "provider.request",
      summary: renderRequestSummary({
        model,
        payload: payloadObj,
        toolCount,
        toolStream,
        thinking,
        responseFormatType,
        maxTokens,
      }),
      details: {
        runtime: {
          provider: status.provider,
          model: status.model,
          baseUrl: status.baseUrl ?? "default",
          patchPolicy: status.resolvedModel?.payloadPatchPolicy,
          canonicalModelId: status.resolvedModel?.canonicalModelId,
          platform: status.resolvedModel?.platform,
          upstreamVendor: status.resolvedModel?.upstreamVendor,
          confidence: status.resolvedModel?.confidence,
        },
        request: {
          provider: model.provider,
          model: model.id,
          api: model.api,
          baseUrl: model.baseUrl,
          ...(model.compat ? { compat: model.compat } : {}),
          stream: payloadObj.stream === true,
          tools: toolCount,
          ...(toolStream === undefined ? {} : { tool_stream: toolStream }),
          ...(thinking.type ? { thinking_type: thinking.type } : {}),
          ...(thinking.clearThinking === undefined
            ? {}
            : { clear_thinking: thinking.clearThinking }),
          ...(thinking.budget === undefined ? {} : { thinking_budget: thinking.budget }),
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
          ...(responseFormatType ? { response_format: responseFormatType } : {}),
          ...(maxTokens.maxTokens === undefined ? {} : { max_tokens: maxTokens.maxTokens }),
          ...(maxTokens.maxOutputTokens === undefined
            ? {}
            : { max_output_tokens: maxTokens.maxOutputTokens }),
          ...(maxTokens.maxCompletionTokens === undefined
            ? {}
            : { max_completion_tokens: maxTokens.maxCompletionTokens }),
          ...(temperature === undefined ? {} : { temperature }),
          ...(topP === undefined ? {} : { top_p: topP }),
          has_strict_tools: hasStrictToolDefinitions(payloadObj.tools),
          has_store: Object.hasOwn(payloadObj, "store"),
          has_stream_options: Object.hasOwn(payloadObj, "stream_options"),
          has_reasoning_effort: Object.hasOwn(payloadObj, "reasoning_effort"),
          has_enable_thinking: Object.hasOwn(payloadObj, "enable_thinking"),
        },
      },
    });
  });

  pi.on("session_start", (_event, ctx) => {
    const currentLevel = ctx.sessionManager.buildSessionContext().thinkingLevel ?? "off";
    setStatusText(ctx, THINKING_STATUS_KEY, formatThinkingStatus(currentLevel, ctx.model));
  });

  pi.on("model_select", (event, ctx) => {
    const currentLevel = ctx.sessionManager.buildSessionContext().thinkingLevel ?? "off";
    setStatusText(ctx, THINKING_STATUS_KEY, formatThinkingStatus(currentLevel, event.model));
  });

  pi.on("thinking_level_select", (event, ctx) => {
    const summary = formatThinkingStatus(event.level, ctx.model);
    setStatusText(ctx, THINKING_STATUS_KEY, summary);
    appendRuntimeEvent({
      type: "thinking.level",
      summary: `thinking level changed: ${event.previousLevel} -> ${event.level} [${getSupportedThinkingLevels(ctx.model).join("/")}]`,
      details: {
        previousLevel: event.previousLevel,
        level: event.level,
        supportedLevels: getSupportedThinkingLevels(ctx.model),
        model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : {},
      },
    });
  });

  pi.on("after_provider_response", (event) => {
    setLatestProviderResponse(buildProviderResponseSnapshot(event));
  });

  pi.on("message_end", (event) => {
    if (event.message.role !== "assistant") {
      return;
    }

    const snapshot = takeLatestProviderResponse();
    if (!snapshot) {
      return;
    }

    const status = getRuntimeStatus();
    const nextMessage = {
      ...event.message,
      glmMeta: {
        ...((event.message as Record<string, unknown>).glmMeta as
          | Record<string, unknown>
          | undefined),
        providerResponse: {
          ...(snapshot.status === undefined ? {} : { status: snapshot.status }),
          ...(snapshot.requestId ? { requestId: snapshot.requestId } : {}),
          ...(snapshot.cacheStatus ? { cacheStatus: snapshot.cacheStatus } : {}),
          ...(snapshot.routedModel ? { routedModel: snapshot.routedModel } : {}),
          ...(status?.model ? { requestedModel: status.model } : {}),
        },
      },
    };

    if (status?.diagnostics?.debugRuntime) {
      appendRuntimeEvent({
        type: "provider.response",
        summary: summarizeProviderResponse({
          snapshot,
          message: event.message as Record<string, unknown>,
          requestedModel: status.model,
        }),
      });
    }

    return {
      message: nextMessage as typeof event.message,
    };
  });
}
