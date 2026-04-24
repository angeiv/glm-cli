import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { AssistantMessageEventStream, streamSimple, type Context, type Model, type SimpleStreamOptions } from "@mariozechner/pi-ai";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import {
  getGenericOpenAiCompatibleCaps,
  getStandardGlmModel,
  getStandardGlmModels,
  resolveGlmProfile,
} from "../shared/glm-profile.js";

const OPENAI_COMPAT = {
  // Many OpenAI-compatible servers reject the newer "developer" role.
  supportsDeveloperRole: false,
} as const;

const ZHIPU_OPENAI_COMPAT = {
  // BigModel / z.ai OpenAI-compatible endpoints are close to OpenAI Chat Completions, but
  // differ in a few fields (tokens/thinking/streaming-tool).
  supportsDeveloperRole: false,
  supportsStore: false,
  supportsUsageInStreaming: false,
  supportsStrictMode: false,
  supportsReasoningEffort: false,
  maxTokensField: "max_tokens",
  thinkingFormat: "zai",
  zaiToolStream: true,
} as const;

function isZhipuOpenAiCompatBaseUrl(baseUrl: string): boolean {
  const normalized = baseUrl.trim().toLowerCase();
  return normalized.includes("open.bigmodel.cn") || normalized.includes("api.z.ai");
}

const GLM_BASE_URL_PRESETS = {
  // BigModel
  bigmodel: "https://open.bigmodel.cn/api/paas/v4/",
  "bigmodel-coding": "https://open.bigmodel.cn/api/coding/paas/v4/",
  // z.ai
  zai: "https://api.z.ai/api/paas/v4/",
  "zai-coding": "https://api.z.ai/api/coding/paas/v4/",
} as const;

type GlmBaseUrlPreset = keyof typeof GLM_BASE_URL_PRESETS;

function normalizeGlmBaseUrlPreset(value?: string): GlmBaseUrlPreset | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;

  const aliases: Record<string, GlmBaseUrlPreset> = {
    "bigmodel-api": "bigmodel",
    "open.bigmodel": "bigmodel",
    "open.bigmodel.cn": "bigmodel",
    "bigmodel-coding-plan": "bigmodel-coding",

    "zai-api": "zai",
    "z.ai": "zai",
    "api.z.ai": "zai",
    "zai-coding-plan": "zai-coding",
  };

  const mapped = aliases[normalized];
  if (mapped) return mapped;

  return Object.prototype.hasOwnProperty.call(GLM_BASE_URL_PRESETS, normalized)
    ? (normalized as GlmBaseUrlPreset)
    : undefined;
}

function resolveGlmBaseUrlPreset(
  envPreset?: string,
  persistedPreset?: string,
): string | undefined {
  const preset = normalizeGlmBaseUrlPreset(envPreset) ?? normalizeGlmBaseUrlPreset(persistedPreset);
  if (!preset) return undefined;
  return GLM_BASE_URL_PRESETS[preset];
}

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

function asTextBlocks(
  content: string | Array<{ type: "text"; text: string }>,
): Array<{ type: "text"; text: string }> {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return content;
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
      continue;
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
  content: Array<{ type: string; text?: string; thinking?: string; id?: string; name?: string; arguments?: Record<string, unknown> }>,
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
      continue;
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

  const texts = content
    .filter((c) => c.type === "text")
    .map((c) => String(c.text ?? ""));

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
        const finalPayload = (nextPayload === undefined ? payload : nextPayload) as Record<string, unknown>;

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
          const detail = parsed?.error?.message || parsed?.detail || rawText || `HTTP ${res.status}`;
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
              stream.push({ type: "thinking_delta", contentIndex: idx, delta: thinking, partial: output });
            }
            stream.push({ type: "thinking_end", contentIndex: idx, content: thinking, partial: output });
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
            stream.push({ type: "thinking_delta", contentIndex: idx, delta: thinking, partial: output });
            stream.push({ type: "thinking_end", contentIndex: idx, content: thinking, partial: output });
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
            continue;
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
          if (event.type === "error" && isModelscopeTerminatedErrorMessage(event.error?.errorMessage)) {
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

function buildCustomModelDefinition(modelId: string, compat: typeof OPENAI_COMPAT = OPENAI_COMPAT) {
  const genericCaps = getGenericOpenAiCompatibleCaps();
  return {
    id: modelId,
    name: modelId,
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: genericCaps.contextWindow,
    maxTokens: genericCaps.maxOutputTokens,
    compat,
  };
}

function resolveOpenAiCompatibleModelDefinition(modelId: string, baseUrl: string) {
  const profile = resolveGlmProfile({ modelId, baseUrl });
  const canonical = profile.canonicalModelId
    ? getStandardGlmModel(profile.canonicalModelId)
    : undefined;
  const compat = profile.payloadPatchPolicy === "glm-native"
    ? ZHIPU_OPENAI_COMPAT
    : OPENAI_COMPAT;

  return {
    id: modelId,
    name: canonical?.displayName ?? modelId,
    reasoning: profile.effectiveCaps.supportsThinking,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: profile.effectiveCaps.contextWindow,
    maxTokens: profile.effectiveCaps.maxOutputTokens,
    compat,
  };
}

function resolveOpenAiResponsesModelDefinition(modelId: string, baseUrl: string) {
  const profile = resolveGlmProfile({ modelId, baseUrl });
  const canonical = profile.canonicalModelId
    ? getStandardGlmModel(profile.canonicalModelId)
    : undefined;

  return {
    id: modelId,
    name: canonical?.displayName ?? modelId,
    reasoning: profile.effectiveCaps.supportsThinking,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: profile.effectiveCaps.contextWindow,
    maxTokens: profile.effectiveCaps.maxOutputTokens,
  };
}

export function resolveAnthropicModels(requestedModelId: string) {
  const standardModels = getStandardGlmModels().map((model) => ({
    id: model.id,
    name: model.displayName,
    reasoning: model.supportsThinking,
    input: model.modalities,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: model.contextWindow,
    maxTokens: model.maxOutputTokens,
  }));

  if (standardModels.some((model) => model.id === requestedModelId)) {
    return standardModels;
  }

  return [
    ...standardModels,
    buildCustomModelDefinition(requestedModelId),
  ];
}

type PersistedProviderConfig = {
  apiKey?: string;
  baseURL?: string;
  endpoint?: string;
};

type PersistedConfig = {
  defaultModel?: string;
  providers?: {
    glm?: PersistedProviderConfig;
    "openai-compatible"?: PersistedProviderConfig;
  };
};

function normalizeProvider(value: unknown): PersistedProviderConfig | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const maybe = value as Record<string, unknown>;
  const apiKey = typeof maybe.apiKey === "string" ? maybe.apiKey : undefined;
  const baseURL = typeof maybe.baseURL === "string" ? maybe.baseURL : undefined;
  const endpoint = typeof maybe.endpoint === "string" ? maybe.endpoint : undefined;
  if (!apiKey && !baseURL && !endpoint) return undefined;
  return { apiKey, baseURL, endpoint };
}

function readPersistedConfig(): PersistedConfig {
  const configPath = join(homedir(), ".glm", "config.json");
  try {
    const contents = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(contents);
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    const providers = (parsed as { providers?: Record<string, unknown> }).providers;
    return {
      defaultModel: typeof (parsed as { defaultModel?: string }).defaultModel === "string"
        ? (parsed as { defaultModel?: string }).defaultModel
        : undefined,
      providers: {
        glm: normalizeProvider(providers?.glm),
        "openai-compatible": normalizeProvider(providers?.["openai-compatible"]),
      },
    };
  } catch {
    return {};
  }
}

const persistedConfig = readPersistedConfig();

export function resolveProviderSettings(options: {
  envApiKey?: string;
  envBaseUrl?: string;
  persisted?: PersistedProviderConfig;
  defaultBaseUrl: string;
}) {
  const envApiKey = options.envApiKey?.trim();
  const persistedApiKey = options.persisted?.apiKey?.trim();
  const envBaseUrl = options.envBaseUrl?.trim();
  const persistedBaseUrl = options.persisted?.baseURL?.trim();

  const apiKey = envApiKey || persistedApiKey;
  const baseUrl = envBaseUrl || persistedBaseUrl || options.defaultBaseUrl;
  return { apiKey, baseUrl };
}

function resolveConfigDefaultModel(): string | undefined {
  return persistedConfig.defaultModel;
}

export default function (pi: ExtensionAPI) {
  const glmPresetBaseUrl = resolveGlmBaseUrlPreset(
    process.env.GLM_ENDPOINT,
    persistedConfig.providers?.glm?.endpoint,
  );
  const glmSettings = resolveProviderSettings({
    envApiKey: process.env.GLM_API_KEY,
    envBaseUrl: process.env.GLM_BASE_URL,
    persisted: persistedConfig.providers?.glm,
    defaultBaseUrl: glmPresetBaseUrl ?? GLM_BASE_URL_PRESETS["bigmodel-coding"],
  });

  if (glmSettings.apiKey) {
    pi.registerProvider("glm", {
      baseUrl: glmSettings.baseUrl,
      apiKey: glmSettings.apiKey,
      api: "openai-completions",
      models: getStandardGlmModels().map((model) => {
        const profile = resolveGlmProfile({
          modelId: model.id,
          baseUrl: glmSettings.baseUrl,
        });
        const compat = profile.payloadPatchPolicy === "glm-native"
          ? ZHIPU_OPENAI_COMPAT
          : OPENAI_COMPAT;

        return {
          id: model.id,
          name: model.displayName,
          reasoning: profile.effectiveCaps.supportsThinking,
          input: model.modalities,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: profile.effectiveCaps.contextWindow,
          maxTokens: profile.effectiveCaps.maxOutputTokens,
          compat,
        };
      }),
    });
  }

  const openaiSettings = resolveProviderSettings({
    envApiKey: process.env.OPENAI_API_KEY,
    envBaseUrl: process.env.OPENAI_BASE_URL,
    persisted: persistedConfig.providers?.["openai-compatible"],
    defaultBaseUrl: "https://api.openai.com/v1",
  });

  if (openaiSettings.apiKey) {
    const openaiModelId = resolveModelId(
      process.env.OPENAI_MODEL,
      process.env.GLM_MODEL,
      resolveConfigDefaultModel(),
    ) ?? "glm-5.1";
    pi.registerProvider("openai-compatible", {
      baseUrl: openaiSettings.baseUrl,
      apiKey: openaiSettings.apiKey,
      api: "openai-completions",
      models: [
        resolveOpenAiCompatibleModelDefinition(openaiModelId, openaiSettings.baseUrl),
      ],
    });

    pi.registerProvider("openai-responses", {
      baseUrl: openaiSettings.baseUrl,
      apiKey: openaiSettings.apiKey,
      api: "openai-responses",
      models: [
        resolveOpenAiResponsesModelDefinition(openaiModelId, openaiSettings.baseUrl),
      ],
    });
  }

  if (process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_MODEL || process.env.ANTHROPIC_BASE_URL) {
    const anthropicModelId = resolveModelId(
      process.env.ANTHROPIC_MODEL,
      process.env.GLM_MODEL,
      resolveConfigDefaultModel(),
    ) ?? "glm-5.1";

    const baseUrl = process.env.ANTHROPIC_BASE_URL ?? "https://open.bigmodel.cn/api/anthropic";
    const isModelscope = isModelscopeAnthropicBaseUrl(baseUrl);

    pi.registerProvider("anthropic", {
      baseUrl,
      apiKey: "ANTHROPIC_AUTH_TOKEN",
      // ModelScope's Anthropic-compatible endpoint supports streaming, but sometimes aborts
      // connections early (undici "terminated"). Prefer streaming and automatically fall back
      // to a non-streaming request to surface real HTTP errors without Pi's retry UI.
      api: isModelscope ? "anthropic-messages-modelscope" : "anthropic-messages",
      ...(isModelscope ? { streamSimple: createStreamFirstModelscopeAnthropicApi() } : {}),
      models: resolveAnthropicModels(anthropicModelId),
    });
  }
}
