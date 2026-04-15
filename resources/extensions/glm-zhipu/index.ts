import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export type ZhipuPayloadOverrides = {
  clearThinking?: boolean;
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

export function resolveZhipuPayloadOverrides(env: NodeJS.ProcessEnv): ZhipuPayloadOverrides {
  const clearThinking = parseBoolean(env.GLM_CLEAR_THINKING);
  const responseFormatType = normalizeResponseFormatType(env.GLM_RESPONSE_FORMAT);

  return {
    clearThinking,
    responseFormatType,
  };
}

export function isZhipuBaseUrl(baseUrl: string): boolean {
  const normalized = baseUrl.trim().toLowerCase();
  return normalized.includes("open.bigmodel.cn") || normalized.includes("api.z.ai");
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

export function applyZhipuPayloadPatches(
  payload: unknown,
  overrides: ZhipuPayloadOverrides,
): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const next = { ...(payload as Record<string, unknown>) };

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

  // `tool_stream` is only meaningful for streaming.
  if (next.tool_stream === true && next.stream !== true) {
    delete next.tool_stream;
  }

  // Map pi-ai's `enable_thinking` / `reasoning_effort` into BigModel's `thinking` object.
  const hasEnableThinking = Object.prototype.hasOwnProperty.call(next, "enable_thinking");
  const hasReasoningEffort = Object.prototype.hasOwnProperty.call(next, "reasoning_effort");
  if (hasEnableThinking || hasReasoningEffort) {
    const enabled = hasEnableThinking
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
    delete next.enable_thinking;
    delete next.reasoning_effort;
  }

  if (overrides.responseFormatType && !Object.prototype.hasOwnProperty.call(next, "response_format")) {
    next.response_format = { type: overrides.responseFormatType };
  }

  return next;
}

export default function (pi: ExtensionAPI) {
  const overrides = resolveZhipuPayloadOverrides(process.env);

  pi.on("before_provider_request", (event, ctx) => {
    const model = ctx.model;
    if (!model) return;
    if (model.api !== "openai-completions") return;
    if (!isZhipuBaseUrl(model.baseUrl)) return;
    return applyZhipuPayloadPatches(event.payload, overrides);
  });
}

