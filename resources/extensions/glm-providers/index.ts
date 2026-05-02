import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  AssistantMessageEventStream,
  streamSimple,
  type Context,
  type Model,
  type SimpleStreamOptions,
} from "@mariozechner/pi-ai";
import {
  getProviderDefaultApi,
  getProviderDisplayName,
  normalizeApiKind,
  normalizeProviderName,
  resolveAnthropicModels,
  resolveNativeGlmProviderModels,
  resolveOpenAiCompatibleModelDefinition,
  resolveOpenAiResponsesModelDefinition,
  resolveProviderSettings as resolveSharedProviderSettings,
} from "../shared/glm-profile.js";
import { readConfigFile } from "../../../src/app/config-store.js";
import { resolveDiscoveredModels } from "../../../src/models/model-discovery.js";

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string | Array<{ type: "text"; text: string }>;
      is_error?: boolean;
    }
  | { type: "thinking"; thinking: string; signature?: string }
  | { type: "redacted_thinking"; data: string };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

type AnthropicToolDefinition = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

type AnthropicMessagesResponse = {
  id?: string;
  model?: string;
  role?: string;
  content?: Array<Record<string, unknown>>;
  stop_reason?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  error?: { message?: string };
  detail?: string;
};

function isModelscopeAnthropicBaseUrl(baseUrl: string): boolean {
  const normalized = baseUrl.trim().toLowerCase();
  return normalized.includes("api-inference.modelscope.cn");
}

function toAnthropicUserContent(
  content: string | Array<{ type: string; text?: string; data?: string; mimeType?: string }>,
): string | AnthropicContentBlock[] {
  if (typeof content === "string") return content;
  if (!Array.isArray(content) || content.length === 0) return "";

  const blocks: AnthropicContentBlock[] = [];
  for (const item of content) {
    if (item.type === "text") {
      const text = String(item.text ?? "");
      blocks.push({ type: "text", text });
      continue;
    }

    if (item.type === "image") {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: String(item.mimeType ?? "application/octet-stream"),
          data: String(item.data ?? ""),
        },
      });
    }
  }

  if (blocks.length === 0) return "";
  const hasImages = blocks.some((b) => b.type === "image");
  if (!hasImages) {
    return blocks
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }
  return blocks;
}

function toAnthropicAssistantContent(
  content: Array<{
    type: string;
    text?: string;
    thinking?: string;
    id?: string;
    name?: string;
    arguments?: Record<string, unknown>;
  }>,
): string | AnthropicContentBlock[] {
  if (!Array.isArray(content) || content.length === 0) return "";

  const blocks: AnthropicContentBlock[] = [];
  for (const item of content) {
    if (item.type === "text") {
      blocks.push({ type: "text", text: String(item.text ?? "") });
      continue;
    }

    if (item.type === "toolCall") {
      blocks.push({
        type: "tool_use",
        id: String(item.id ?? ""),
        name: String(item.name ?? ""),
        input: (item.arguments ?? {}) as Record<string, unknown>,
      });
    }

    // Skip thinking blocks when sending context back to the model.
  }

  if (blocks.length === 0) return "";
  const hasNonText = blocks.some((b) => b.type !== "text");
  if (!hasNonText) {
    return blocks
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }
  return blocks;
}

function toAnthropicToolResultContent(
  content: Array<{ type: string; text?: string }>,
): string | Array<{ type: "text"; text: string }> {
  if (!Array.isArray(content) || content.length === 0) return "";

  const texts = content.filter((c) => c.type === "text").map((c) => String(c.text ?? ""));

  // Tool results should be plain text for broad compatibility.
  return texts.join("\n");
}

function toAnthropicMessages(context: Context): AnthropicMessage[] {
  const messages: AnthropicMessage[] = [];

  for (const msg of context.messages) {
    if (msg.role === "user") {
      messages.push({
        role: "user",
        content: toAnthropicUserContent(msg.content as any),
      });
      continue;
    }

    if (msg.role === "assistant") {
      messages.push({
        role: "assistant",
        content: toAnthropicAssistantContent(msg.content as any),
      });
      continue;
    }

    if (msg.role === "toolResult") {
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.toolCallId,
            content: toAnthropicToolResultContent(msg.content as any),
            ...(msg.isError ? { is_error: true } : {}),
          },
        ],
      });
    }
  }

  return messages;
}

function toAnthropicTools(context: Context): AnthropicToolDefinition[] | undefined {
  if (!context.tools || context.tools.length === 0) return undefined;

  return context.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as unknown as Record<string, unknown>,
  }));
}

function mapAnthropicStopReason(reason: string | null | undefined): "stop" | "length" | "toolUse" {
  if (!reason) return "stop";
  if (reason === "max_tokens") return "length";
  if (reason === "tool_use") return "toolUse";
  return "stop";
}

function isModelscopeTerminatedErrorMessage(message: string | undefined): boolean {
  if (!message) return false;
  return message.toLowerCase().includes("terminated");
}

function createNonStreamingModelscopeAnthropicApi() {
  return (model: Model<any>, context: Context, options?: SimpleStreamOptions) => {
    const stream = new AssistantMessageEventStream();

    (async () => {
      const output = {
        role: "assistant" as const,
        content: [] as Array<any>,
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop" as const,
        timestamp: Date.now(),
      };

      try {
        const url = new URL("/v1/messages", model.baseUrl).toString();
        const maxTokens = options?.maxTokens || Math.min(model.maxTokens, 32000);

        const payload = {
          model: model.id,
          max_tokens: maxTokens,
          messages: toAnthropicMessages(context),
          ...(context.systemPrompt ? { system: context.systemPrompt } : {}),
          ...(toAnthropicTools(context) ? { tools: toAnthropicTools(context) } : {}),
          ...(typeof options?.temperature === "number" ? { temperature: options.temperature } : {}),
          stream: false,
        };

        const nextPayload = await options?.onPayload?.(payload, model);
        const finalPayload = (nextPayload === undefined ? payload : nextPayload) as Record<
          string,
          unknown
        >;

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(options?.apiKey ? { "x-api-key": options.apiKey } : {}),
            ...(options?.headers ?? {}),
          },
          body: JSON.stringify(finalPayload),
          signal: options?.signal,
        });

        const rawText = await res.text();
        let parsed: AnthropicMessagesResponse | undefined;
        try {
          parsed = rawText ? (JSON.parse(rawText) as AnthropicMessagesResponse) : undefined;
        } catch {
          parsed = undefined;
        }

        if (!res.ok) {
          const detail =
            parsed?.error?.message || parsed?.detail || rawText || `HTTP ${res.status}`;
          throw new Error(`${res.status} ${detail}`.trim());
        }

        stream.push({ type: "start", partial: output });

        const blocks = (parsed?.content ?? []) as Array<Record<string, unknown>>;
        for (const block of blocks) {
          const type = String(block.type ?? "");

          if (type === "text") {
            const text = String(block.text ?? "");
            output.content.push({ type: "text", text });
            const idx = output.content.length - 1;
            stream.push({ type: "text_start", contentIndex: idx, partial: output });
            if (text) {
              stream.push({ type: "text_delta", contentIndex: idx, delta: text, partial: output });
            }
            stream.push({ type: "text_end", contentIndex: idx, content: text, partial: output });
            continue;
          }

          if (type === "thinking") {
            const thinking = String((block as any).thinking ?? "");
            output.content.push({ type: "thinking", thinking });
            const idx = output.content.length - 1;
            stream.push({ type: "thinking_start", contentIndex: idx, partial: output });
            if (thinking) {
              stream.push({
                type: "thinking_delta",
                contentIndex: idx,
                delta: thinking,
                partial: output,
              });
            }
            stream.push({
              type: "thinking_end",
              contentIndex: idx,
              content: thinking,
              partial: output,
            });
            continue;
          }

          if (type === "redacted_thinking") {
            const signature = String((block as any).data ?? "");
            const thinking = "[Reasoning redacted]";
            output.content.push({
              type: "thinking",
              thinking,
              thinkingSignature: signature,
              redacted: true,
            });
            const idx = output.content.length - 1;
            stream.push({ type: "thinking_start", contentIndex: idx, partial: output });
            stream.push({
              type: "thinking_delta",
              contentIndex: idx,
              delta: thinking,
              partial: output,
            });
            stream.push({
              type: "thinking_end",
              contentIndex: idx,
              content: thinking,
              partial: output,
            });
            continue;
          }

          if (type === "tool_use") {
            const toolCall = {
              type: "toolCall",
              id: String((block as any).id ?? ""),
              name: String((block as any).name ?? ""),
              arguments: ((block as any).input ?? {}) as Record<string, unknown>,
            };
            output.content.push(toolCall);
            const idx = output.content.length - 1;
            stream.push({ type: "toolcall_start", contentIndex: idx, partial: output });
            stream.push({ type: "toolcall_end", contentIndex: idx, toolCall, partial: output });
          }
        }

        const inputTokens = parsed?.usage?.input_tokens ?? 0;
        const outputTokens = parsed?.usage?.output_tokens ?? 0;
        const cacheReadTokens = parsed?.usage?.cache_read_input_tokens ?? 0;
        const cacheWriteTokens = parsed?.usage?.cache_creation_input_tokens ?? 0;
        output.usage.input = inputTokens;
        output.usage.output = outputTokens;
        output.usage.cacheRead = cacheReadTokens;
        output.usage.cacheWrite = cacheWriteTokens;
        output.usage.totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;

        const stopReason = mapAnthropicStopReason(parsed?.stop_reason);
        output.stopReason = stopReason;
        output.responseId = parsed?.id;

        stream.push({ type: "done", reason: stopReason, message: output });
        stream.end();
      } catch (error) {
        output.stopReason = options?.signal?.aborted ? "aborted" : "error";
        output.errorMessage = error instanceof Error ? error.message : String(error);
        stream.push({
          type: "error",
          reason: output.stopReason,
          error: output,
        });
        stream.end();
      }
    })();

    return stream;
  };
}

function createStreamFirstModelscopeAnthropicApi() {
  const fallback = createNonStreamingModelscopeAnthropicApi();

  return (model: Model<any>, context: Context, options?: SimpleStreamOptions) => {
    const stream = new AssistantMessageEventStream();

    (async () => {
      const buffered: any[] = [];
      let flushed = false;

      const flush = () => {
        if (flushed) return;
        flushed = true;
        for (const event of buffered) {
          stream.push(event);
        }
        buffered.length = 0;
      };

      try {
        const primary = streamSimple({ ...model, api: "anthropic-messages" }, context, options);

        for await (const event of primary) {
          if (
            event.type === "error" &&
            isModelscopeTerminatedErrorMessage(event.error?.errorMessage)
          ) {
            if (options?.signal?.aborted) {
              stream.push(event as any);
              stream.end(event.error as any);
              return;
            }

            const fallbackStream = fallback(model, context, options);

            if (!flushed) {
              // If the stream aborted before any meaningful output, fall back to a non-streaming request
              // without showing Pi's retry UI.
              for await (const fallbackEvent of fallbackStream) {
                stream.push(fallbackEvent as any);
              }
              stream.end(await fallbackStream.result());
              return;
            }

            // We already emitted partial output; finish the message with a non-streaming request.
            const final = await fallbackStream.result();
            if (final.stopReason === "error" || final.stopReason === "aborted") {
              stream.push({ type: "error", reason: final.stopReason, error: final });
            } else {
              stream.push({ type: "done", reason: final.stopReason, message: final });
            }
            stream.end(final as any);
            return;
          }

          if (event.type === "error" && !flushed) {
            // Hide the buffered "start" event for early failures (e.g. invalid auth).
            stream.push(event as any);
            stream.end(event.error as any);
            return;
          }

          if (!flushed) {
            buffered.push(event as any);

            // Don't emit a start event until we see actual output. ModelScope sometimes terminates
            // streaming connections early (undici "terminated"), and delaying avoids Pi's retry UI.
            if (
              event.type === "text_delta" ||
              event.type === "thinking_delta" ||
              event.type === "toolcall_delta" ||
              event.type === "toolcall_start" ||
              event.type === "done"
            ) {
              flush();
            }

            // Keep buffering until flush.
            continue;
          }

          stream.push(event as any);
        }

        if (!flushed) {
          flush();
        }

        stream.end(await primary.result());
      } catch (error) {
        // Defensive: If anything goes wrong before we emitted output, fall back to non-streaming.
        const message = error instanceof Error ? error.message : String(error);
        const stopReason = options?.signal?.aborted ? "aborted" : "error";

        if (isModelscopeTerminatedErrorMessage(message) && !options?.signal?.aborted) {
          const fallbackStream = fallback(model, context, options);

          if (!flushed) {
            for await (const fallbackEvent of fallbackStream) {
              stream.push(fallbackEvent as any);
            }
            stream.end(await fallbackStream.result());
            return;
          }

          const final = await fallbackStream.result();
          if (final.stopReason === "error" || final.stopReason === "aborted") {
            stream.push({ type: "error", reason: final.stopReason, error: final });
          } else {
            stream.push({ type: "done", reason: final.stopReason, message: final });
          }
          stream.end(final as any);
          return;
        }

        const output = {
          role: "assistant" as const,
          content: [] as Array<any>,
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason,
          errorMessage: message,
          timestamp: Date.now(),
        };

        stream.push({ type: "error", reason: stopReason, error: output });
        stream.end(output);
      }
    })();

    return stream;
  };
}

function normalizeBigModelModelId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.toLowerCase().startsWith("glm-")) {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

function resolveModelId(...candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return normalizeBigModelModelId(candidate);
    }
  }
  return undefined;
}

export function resolveProviderSettings(options) {
  return resolveSharedProviderSettings(options);
}

function resolveSelectedProvider(defaultProvider) {
  return (
    normalizeProviderName(process.env.GLM_PROVIDER) ??
    normalizeProviderName(defaultProvider) ??
    "bigmodel-coding"
  );
}

function resolveSelectedApi(provider, persisted, defaultApi) {
  return (
    normalizeApiKind(process.env.GLM_API) ??
    normalizeApiKind(persisted?.api) ??
    normalizeApiKind(defaultApi) ??
    getProviderDefaultApi(provider)
  );
}

function resolveRequestedModelId(provider, api, defaultModel) {
  if (api === "anthropic") {
    return (
      resolveModelId(process.env.ANTHROPIC_MODEL, process.env.GLM_MODEL, defaultModel) ?? "glm-5.1"
    );
  }

  if (
    provider === "bigmodel" ||
    provider === "bigmodel-coding" ||
    provider === "zai" ||
    provider === "zai-coding"
  ) {
    return (
      resolveModelId(process.env.GLM_MODEL, process.env.OPENAI_MODEL, defaultModel) ?? "glm-5.1"
    );
  }

  return resolveModelId(process.env.OPENAI_MODEL, process.env.GLM_MODEL, defaultModel) ?? "glm-5.1";
}

function shouldRegisterProvider(provider, persisted) {
  return Boolean(
    process.env.GLM_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim() ||
      process.env.ANTHROPIC_AUTH_TOKEN?.trim() ||
      process.env.GLM_MODEL?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      process.env.ANTHROPIC_MODEL?.trim() ||
      persisted?.apiKey?.trim() ||
      persisted?.baseURL?.trim(),
  );
}

function isNativeOfficialProvider(provider) {
  return (
    provider === "bigmodel" ||
    provider === "bigmodel-coding" ||
    provider === "zai" ||
    provider === "zai-coding"
  );
}

function mergeRequestedModelId(models, requestedModelId) {
  if (models.some((model) => model.id === requestedModelId)) {
    return models;
  }

  return [...models, { id: requestedModelId }];
}

function buildGatewayModelDefinitions({ provider, api, baseUrl, modelIds, overrides }) {
  const uniqueModelIds = [
    ...new Set(modelIds.map((modelId) => modelId.trim()).filter(Boolean)),
  ].sort((left, right) => left.localeCompare(right));

  return uniqueModelIds.map((modelId) =>
    api === "openai-responses"
      ? resolveOpenAiResponsesModelDefinition({
          provider,
          modelId,
          baseUrl,
          overrides,
        })
      : resolveOpenAiCompatibleModelDefinition({
          provider,
          modelId,
          baseUrl,
          overrides,
        }),
  );
}

export default async function (pi: ExtensionAPI) {
  const config = await readConfigFile();
  const provider = resolveSelectedProvider(config.defaultProvider);
  const persisted = config.providers?.[provider];
  const api = resolveSelectedApi(provider, persisted, config.defaultApi);

  if (!shouldRegisterProvider(provider, persisted)) {
    return;
  }

  const settings = resolveSharedProviderSettings({
    provider,
    api,
    env: process.env,
    persisted,
  });
  const modelId = resolveRequestedModelId(provider, api, config.defaultModel);
  const isModelscope = api === "anthropic" && isModelscopeAnthropicBaseUrl(settings.baseUrl);
  const modelProfileOverrides = config.modelOverrides;

  const discoveredModels =
    api === "anthropic" || isNativeOfficialProvider(provider)
      ? []
      : (
          await resolveDiscoveredModels({
            provider,
            api,
            baseUrl: settings.baseUrl,
            apiKey: settings.apiKey,
            config: config.modelDiscovery,
          })
        ).models;

  const models =
    api === "anthropic"
      ? resolveAnthropicModels({
          provider,
          requestedModelId: modelId,
          baseUrl: settings.baseUrl,
          overrides: modelProfileOverrides,
        })
      : api === "openai-responses"
        ? [
            ...buildGatewayModelDefinitions({
              provider,
              api,
              baseUrl: settings.baseUrl,
              modelIds: mergeRequestedModelId(discoveredModels, modelId).map((model) => model.id),
              overrides: modelProfileOverrides,
            }),
          ]
        : isNativeOfficialProvider(provider)
          ? resolveNativeGlmProviderModels({
              provider,
              baseUrl: settings.baseUrl,
              overrides: modelProfileOverrides,
            })
          : buildGatewayModelDefinitions({
              provider,
              api,
              baseUrl: settings.baseUrl,
              modelIds: mergeRequestedModelId(discoveredModels, modelId).map((model) => model.id),
              overrides: modelProfileOverrides,
            });

  pi.registerProvider(provider, {
    name: getProviderDisplayName(provider),
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey ?? "",
    api:
      api === "anthropic"
        ? isModelscope
          ? "anthropic-messages-modelscope"
          : "anthropic-messages"
        : api === "openai-responses"
          ? "openai-responses"
          : "openai-completions",
    ...(isModelscope ? { streamSimple: createStreamFirstModelscopeAnthropicApi() } : {}),
    models,
  });
}
