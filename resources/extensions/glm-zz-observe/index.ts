import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { appendRuntimeEvent, getRuntimeStatus } from "../shared/runtime-state.js";

type ProviderModelInfo = {
  provider?: string;
  id?: string;
  api?: string;
  baseUrl?: string;
  compat?: Record<string, unknown>;
};

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
    if (fn && Object.prototype.hasOwnProperty.call(fn, "strict")) {
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
    args.maxTokens.maxOutputTokens !== undefined ? `max_output_tokens=${args.maxTokens.maxOutputTokens}` : undefined,
    args.maxTokens.maxCompletionTokens !== undefined ? `max_completion_tokens=${args.maxTokens.maxCompletionTokens}` : undefined,
  ].filter(Boolean);

  return parts.join(" | ");
}

export default function (pi: ExtensionAPI) {
  pi.on("before_provider_request", (event, ctx) => {
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
          has_store: Object.prototype.hasOwnProperty.call(payloadObj, "store"),
          has_stream_options: Object.prototype.hasOwnProperty.call(payloadObj, "stream_options"),
          has_reasoning_effort: Object.prototype.hasOwnProperty.call(payloadObj, "reasoning_effort"),
          has_enable_thinking: Object.prototype.hasOwnProperty.call(payloadObj, "enable_thinking"),
        },
      },
    });
  });
}
