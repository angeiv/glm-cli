import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { AssistantMessageEventStream, type Context, type Model, type SimpleStreamOptions } from "@mariozechner/pi-ai";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const OPENAI_COMPAT = {
  // Many OpenAI-compatible servers reject the newer "developer" role.
  supportsDeveloperRole: false,
} as const;

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
  usage?: { input_tokens?: number; output_tokens?: number };
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
        output.usage.input = inputTokens;
        output.usage.output = outputTokens;
        output.usage.totalTokens = inputTokens + outputTokens;

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

const glmBaseModels = [
  {
    id: "glm-5.1",
    name: "GLM 5.1",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204_800,
    maxTokens: 131_072,
  },
  {
    id: "glm-5-turbo",
    name: "GLM 5 Turbo",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204_800,
    maxTokens: 131_072,
  },
  {
    id: "glm-5",
    name: "GLM 5",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204_800,
    maxTokens: 131_072,
  },
  {
    id: "glm-4.7",
    name: "GLM 4.7",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204_800,
    maxTokens: 131_072,
  },
  {
    id: "glm-4.7-flash",
    name: "GLM 4.7 Flash",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204_800,
    maxTokens: 131_072,
  },
  {
    id: "glm-4.7-flashx",
    name: "GLM 4.7 FlashX",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204_800,
    maxTokens: 131_072,
  },
  {
    id: "glm-4.6",
    name: "GLM 4.6",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204_800,
    maxTokens: 131_072,
  },
  {
    id: "glm-4.5-air",
    name: "GLM 4.5 Air",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 98_304,
  },
  {
    id: "glm-4.5-airx",
    name: "GLM 4.5 AirX",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 98_304,
  },
  {
    id: "glm-4.5-flash",
    name: "GLM 4.5 Flash",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 98_304,
  },
  {
    id: "glm-4-flash-250414",
    name: "GLM 4 Flash 250414",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 16_384,
  },
  {
    id: "glm-4-flashx-250414",
    name: "GLM 4 FlashX 250414",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 16_384,
  },
];

const glmModels = glmBaseModels.map((model) => ({
  ...model,
  compat: OPENAI_COMPAT,
}));

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

function buildCustomModelDefinition(modelId: string) {
  return {
    id: modelId,
    name: modelId,
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_192,
    compat: OPENAI_COMPAT,
  };
}

function resolveModelDefinition(modelId: string) {
  return glmModels.find((model) => model.id === modelId) ?? buildCustomModelDefinition(modelId);
}

export function resolveAnthropicModels(requestedModelId: string) {
  if (glmModels.some((model) => model.id === requestedModelId)) {
    return glmModels;
  }

  return [
    ...glmModels,
    buildCustomModelDefinition(requestedModelId),
  ];
}

type PersistedProviderConfig = {
  apiKey?: string;
  baseURL?: string;
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
  if (!apiKey && !baseURL) return undefined;
  return { apiKey, baseURL };
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
  const glmSettings = resolveProviderSettings({
    envApiKey: process.env.GLM_API_KEY,
    envBaseUrl: process.env.GLM_BASE_URL,
    persisted: persistedConfig.providers?.glm,
    defaultBaseUrl: "https://open.bigmodel.cn/api/coding/paas/v4/",
  });

  if (glmSettings.apiKey) {
    pi.registerProvider("glm", {
      baseUrl: glmSettings.baseUrl,
      apiKey: glmSettings.apiKey,
      api: "openai-completions",
      models: glmModels,
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
        resolveModelDefinition(openaiModelId),
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
      // ModelScope's Anthropic-compatible endpoint aborts streaming responses (undici "terminated").
      // Use a non-streaming implementation to keep the agent usable and surface HTTP errors.
      api: isModelscope ? "anthropic-messages-modelscope" : "anthropic-messages",
      ...(isModelscope ? { streamSimple: createNonStreamingModelscopeAnthropicApi() } : {}),
      models: resolveAnthropicModels(anthropicModelId),
    });
  }
}
