import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { resolveGlmProfileV2 } from "../shared/glm-profile.js";
import { readGlmModelProfileOverrides } from "../shared/glm-user-config.js";

const modelProfileOverrides = readGlmModelProfileOverrides();

export type ZhipuPayloadOverrides = {
  thinkingMode?: "auto" | "enabled" | "disabled";
  clearThinking?: boolean;
  toolStream?: "auto" | "on" | "off";
  responseFormatType?: "json_object";
};

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return undefined;
}

function normalizeResponseFormatType(value: string | undefined): "json_object" | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;

  if (normalized === "json_object" || normalized === "json") {
    return "json_object";
  }

  return undefined;
}

function normalizeThinkingMode(
  value: string | undefined,
): "auto" | "enabled" | "disabled" | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;

  if (normalized === "auto" || normalized === "enabled" || normalized === "disabled") {
    return normalized;
  }

  return undefined;
}

function normalizeToolStreamMode(
  value: string | undefined,
): "auto" | "on" | "off" | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;

  if (normalized === "auto" || normalized === "on" || normalized === "off") {
    return normalized;
  }

  return undefined;
}

export function resolveZhipuPayloadOverrides(env: NodeJS.ProcessEnv): ZhipuPayloadOverrides {
  const thinkingMode = normalizeThinkingMode(env.GLM_THINKING_MODE);
  const clearThinking = parseBoolean(env.GLM_CLEAR_THINKING);
  const toolStream = normalizeToolStreamMode(env.GLM_TOOL_STREAM);
  const responseFormatType = normalizeResponseFormatType(env.GLM_RESPONSE_FORMAT);

  return {
    thinkingMode,
    clearThinking,
    toolStream,
    responseFormatType,
  };
}

export function isZhipuBaseUrl(baseUrl: string): boolean {
  const normalized = baseUrl.trim().toLowerCase();
  return normalized.includes("open.bigmodel.cn") || normalized.includes("api.z.ai");
}

export function shouldApplyGlmNativePayloadPatches(model: {
  id?: string;
  baseUrl?: string;
  api?: string;
  provider?: string;
}): boolean {
  if (model.api !== "openai-completions") {
    return false;
  }

  const profile = resolveGlmProfileV2({
    provider: model.provider,
    modelId: model.id ?? "",
    baseUrl: model.baseUrl,
    overrides: modelProfileOverrides,
  });

  return profile.payloadPatchPolicy === "glm-native";
}

function stripStrictFromTools(tools: unknown): unknown {
  if (!Array.isArray(tools)) return tools;

  let changed = false;
  const nextTools = tools.map((tool) => {
    if (!tool || typeof tool !== "object") return tool;
    const maybeTool = tool as Record<string, unknown>;
    const fn = maybeTool.function;
    if (!fn || typeof fn !== "object") return tool;
    if (!Object.prototype.hasOwnProperty.call(fn, "strict")) return tool;

    const nextFn = { ...(fn as Record<string, unknown>) };
    delete nextFn.strict;
    changed = true;
    return { ...maybeTool, function: nextFn };
  });

  return changed ? nextTools : tools;
}

function shouldEnableThinkingFromReasoningEffort(value: unknown): boolean {
  if (typeof value !== "string") {
    return !!value;
  }
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "none" && normalized !== "disabled" && normalized !== "off";
}

function hasToolDefinitions(tools: unknown): boolean {
  return Array.isArray(tools) && tools.length > 0;
}

export function applyZhipuPayloadPatches(
  payload: unknown,
  overrides: ZhipuPayloadOverrides,
  model?: {
    provider?: string;
    id?: string;
    baseUrl?: string;
  },
): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const next = { ...(payload as Record<string, unknown>) };
  const profile =
    model && typeof model.id === "string"
      ? resolveGlmProfileV2({
          provider: model.provider,
          modelId: model.id,
          baseUrl: model.baseUrl,
          overrides: modelProfileOverrides,
        })
      : undefined;
  const caps = profile?.effectiveCaps;

  // BigModel docs use `max_tokens`. Some OpenAI-oriented clients send `max_completion_tokens`.
  if (
    Object.prototype.hasOwnProperty.call(next, "max_completion_tokens") &&
    !Object.prototype.hasOwnProperty.call(next, "max_tokens")
  ) {
    next.max_tokens = next.max_completion_tokens;
    delete next.max_completion_tokens;
  }

  // Some OpenAI-compatible servers reject these newer fields.
  delete next.store;
  delete next.stream_options;

  // Some providers reject `strict` in tool definitions.
  if (Object.prototype.hasOwnProperty.call(next, "tools")) {
    next.tools = stripStrictFromTools(next.tools);
  }

  // `tool_stream` is only meaningful for streaming tool calls.
  const supportsToolStream = caps ? caps.supportsToolStream : true;
  const hasTools = hasToolDefinitions(next.tools);
  const shouldStreamTools = next.stream === true && hasTools;
  if (!shouldStreamTools) {
    delete next.tool_stream;
  } else if (!supportsToolStream) {
    delete next.tool_stream;
  } else if (overrides.toolStream === "off") {
    delete next.tool_stream;
  } else if (overrides.toolStream === "on" || overrides.toolStream === "auto") {
    next.tool_stream = true;
  }

  // Map pi-ai's `enable_thinking` / `reasoning_effort` into BigModel's `thinking` object.
  const supportsThinking = caps ? caps.supportsThinking : true;
  const hasEnableThinking = Object.prototype.hasOwnProperty.call(next, "enable_thinking");
  const hasReasoningEffort = Object.prototype.hasOwnProperty.call(next, "reasoning_effort");
  const hasExistingThinking =
    Object.prototype.hasOwnProperty.call(next, "thinking") &&
    next.thinking &&
    typeof next.thinking === "object";
  const forcedThinkingMode =
    overrides.thinkingMode && overrides.thinkingMode !== "auto"
      ? overrides.thinkingMode
      : undefined;

  if (!supportsThinking && Object.prototype.hasOwnProperty.call(next, "thinking")) {
    delete next.thinking;
  }

  if (
    supportsThinking &&
    (forcedThinkingMode ||
      hasEnableThinking ||
      hasReasoningEffort ||
      (hasExistingThinking && overrides.clearThinking !== undefined))
  ) {
    const enabled = forcedThinkingMode
      ? forcedThinkingMode === "enabled"
      : hasEnableThinking
        ? !!next.enable_thinking
        : shouldEnableThinkingFromReasoningEffort(next.reasoning_effort);

    const existingThinking =
      next.thinking && typeof next.thinking === "object"
        ? ({ ...(next.thinking as Record<string, unknown>) } as Record<string, unknown>)
        : undefined;

    const thinking: Record<string, unknown> = { ...(existingThinking ?? {}) };
    thinking.type = enabled ? "enabled" : "disabled";
    if (overrides.clearThinking !== undefined) {
      thinking.clear_thinking = overrides.clearThinking;
    }

    next.thinking = thinking;
  }

  delete next.enable_thinking;
  delete next.reasoning_effort;

  const supportsStructuredOutput = caps ? caps.supportsStructuredOutput : true;
  if (!supportsStructuredOutput && Object.prototype.hasOwnProperty.call(next, "response_format")) {
    delete next.response_format;
  }

  if (
    supportsStructuredOutput &&
    overrides.responseFormatType &&
    !Object.prototype.hasOwnProperty.call(next, "response_format")
  ) {
    next.response_format = { type: overrides.responseFormatType };
  }

  return next;
}

export default function (pi: ExtensionAPI) {
  const overrides = resolveZhipuPayloadOverrides(process.env);

  pi.on("before_provider_request", (event, ctx) => {
    const model = ctx.model;
    if (!model) return;
    if (!shouldApplyGlmNativePayloadPatches(model)) return;
    return applyZhipuPayloadPatches(event.payload, overrides, model);
  });
}
