// resources/extensions/glm-providers/index.ts
import { AssistantMessageEventStream, streamSimple } from "@mariozechner/pi-ai";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
var OPENAI_COMPAT = {
  // Many OpenAI-compatible servers reject the newer "developer" role.
  supportsDeveloperRole: false
};
var ZHIPU_OPENAI_COMPAT = {
  // BigModel / z.ai OpenAI-compatible endpoints are close to OpenAI Chat Completions, but
  // differ in a few fields (tokens/thinking/streaming-tool).
  supportsDeveloperRole: false,
  supportsStore: false,
  supportsUsageInStreaming: false,
  supportsStrictMode: false,
  supportsReasoningEffort: false,
  maxTokensField: "max_tokens",
  thinkingFormat: "zai",
  zaiToolStream: true
};
function isZhipuOpenAiCompatBaseUrl(baseUrl) {
  const normalized = baseUrl.trim().toLowerCase();
  return normalized.includes("open.bigmodel.cn") || normalized.includes("api.z.ai");
}
var GLM_BASE_URL_PRESETS = {
  // BigModel
  bigmodel: "https://open.bigmodel.cn/api/paas/v4/",
  "bigmodel-coding": "https://open.bigmodel.cn/api/coding/paas/v4/",
  // z.ai
  zai: "https://api.z.ai/api/paas/v4/",
  "zai-coding": "https://api.z.ai/api/coding/paas/v4/"
};
function normalizeGlmBaseUrlPreset(value) {
  if (!value) return void 0;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return void 0;
  const aliases = {
    "bigmodel-api": "bigmodel",
    "open.bigmodel": "bigmodel",
    "open.bigmodel.cn": "bigmodel",
    "bigmodel-coding-plan": "bigmodel-coding",
    "zai-api": "zai",
    "z.ai": "zai",
    "api.z.ai": "zai",
    "zai-coding-plan": "zai-coding"
  };
  const mapped = aliases[normalized];
  if (mapped) return mapped;
  return Object.prototype.hasOwnProperty.call(GLM_BASE_URL_PRESETS, normalized) ? normalized : void 0;
}
function resolveGlmBaseUrlPreset(envPreset, persistedPreset) {
  const preset = normalizeGlmBaseUrlPreset(envPreset) ?? normalizeGlmBaseUrlPreset(persistedPreset);
  if (!preset) return void 0;
  return GLM_BASE_URL_PRESETS[preset];
}
function isModelscopeAnthropicBaseUrl(baseUrl) {
  const normalized = baseUrl.trim().toLowerCase();
  return normalized.includes("api-inference.modelscope.cn");
}
function toAnthropicUserContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content) || content.length === 0) return "";
  const blocks = [];
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
          data: String(item.data ?? "")
        }
      });
      continue;
    }
  }
  if (blocks.length === 0) return "";
  const hasImages = blocks.some((b) => b.type === "image");
  if (!hasImages) {
    return blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  }
  return blocks;
}
function toAnthropicAssistantContent(content) {
  if (!Array.isArray(content) || content.length === 0) return "";
  const blocks = [];
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
        input: item.arguments ?? {}
      });
      continue;
    }
  }
  if (blocks.length === 0) return "";
  const hasNonText = blocks.some((b) => b.type !== "text");
  if (!hasNonText) {
    return blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  }
  return blocks;
}
function toAnthropicToolResultContent(content) {
  if (!Array.isArray(content) || content.length === 0) return "";
  const texts = content.filter((c) => c.type === "text").map((c) => String(c.text ?? ""));
  return texts.join("\n");
}
function toAnthropicMessages(context) {
  const messages = [];
  for (const msg of context.messages) {
    if (msg.role === "user") {
      messages.push({
        role: "user",
        content: toAnthropicUserContent(msg.content)
      });
      continue;
    }
    if (msg.role === "assistant") {
      messages.push({
        role: "assistant",
        content: toAnthropicAssistantContent(msg.content)
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
            content: toAnthropicToolResultContent(msg.content),
            ...msg.isError ? { is_error: true } : {}
          }
        ]
      });
    }
  }
  return messages;
}
function toAnthropicTools(context) {
  if (!context.tools || context.tools.length === 0) return void 0;
  return context.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters
  }));
}
function mapAnthropicStopReason(reason) {
  if (!reason) return "stop";
  if (reason === "max_tokens") return "length";
  if (reason === "tool_use") return "toolUse";
  return "stop";
}
function isModelscopeTerminatedErrorMessage(message) {
  if (!message) return false;
  return message.toLowerCase().includes("terminated");
}
function createNonStreamingModelscopeAnthropicApi() {
  return (model, context, options) => {
    const stream = new AssistantMessageEventStream();
    (async () => {
      const output = {
        role: "assistant",
        content: [],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
        },
        stopReason: "stop",
        timestamp: Date.now()
      };
      try {
        const url = new URL("/v1/messages", model.baseUrl).toString();
        const maxTokens = options?.maxTokens || Math.min(model.maxTokens, 32e3);
        const payload = {
          model: model.id,
          max_tokens: maxTokens,
          messages: toAnthropicMessages(context),
          ...context.systemPrompt ? { system: context.systemPrompt } : {},
          ...toAnthropicTools(context) ? { tools: toAnthropicTools(context) } : {},
          ...typeof options?.temperature === "number" ? { temperature: options.temperature } : {},
          stream: false
        };
        const nextPayload = await options?.onPayload?.(payload, model);
        const finalPayload = nextPayload === void 0 ? payload : nextPayload;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...options?.apiKey ? { "x-api-key": options.apiKey } : {},
            ...options?.headers ?? {}
          },
          body: JSON.stringify(finalPayload),
          signal: options?.signal
        });
        const rawText = await res.text();
        let parsed;
        try {
          parsed = rawText ? JSON.parse(rawText) : void 0;
        } catch {
          parsed = void 0;
        }
        if (!res.ok) {
          const detail = parsed?.error?.message || parsed?.detail || rawText || `HTTP ${res.status}`;
          throw new Error(`${res.status} ${detail}`.trim());
        }
        stream.push({ type: "start", partial: output });
        const blocks = parsed?.content ?? [];
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
            const thinking = String(block.thinking ?? "");
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
            const signature = String(block.data ?? "");
            const thinking = "[Reasoning redacted]";
            output.content.push({
              type: "thinking",
              thinking,
              thinkingSignature: signature,
              redacted: true
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
              id: String(block.id ?? ""),
              name: String(block.name ?? ""),
              arguments: block.input ?? {}
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
          error: output
        });
        stream.end();
      }
    })();
    return stream;
  };
}
function createStreamFirstModelscopeAnthropicApi() {
  const fallback = createNonStreamingModelscopeAnthropicApi();
  return (model, context, options) => {
    const stream = new AssistantMessageEventStream();
    (async () => {
      const buffered = [];
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
              stream.push(event);
              stream.end(event.error);
              return;
            }
            const fallbackStream = fallback(model, context, options);
            if (!flushed) {
              for await (const fallbackEvent of fallbackStream) {
                stream.push(fallbackEvent);
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
            stream.end(final);
            return;
          }
          if (event.type === "error" && !flushed) {
            stream.push(event);
            stream.end(event.error);
            return;
          }
          if (!flushed) {
            buffered.push(event);
            if (event.type === "text_delta" || event.type === "thinking_delta" || event.type === "toolcall_delta" || event.type === "toolcall_start" || event.type === "done") {
              flush();
            }
            continue;
          }
          stream.push(event);
        }
        if (!flushed) {
          flush();
        }
        stream.end(await primary.result());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stopReason = options?.signal?.aborted ? "aborted" : "error";
        if (isModelscopeTerminatedErrorMessage(message) && !options?.signal?.aborted) {
          const fallbackStream = fallback(model, context, options);
          if (!flushed) {
            for await (const fallbackEvent of fallbackStream) {
              stream.push(fallbackEvent);
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
          stream.end(final);
          return;
        }
        const output = {
          role: "assistant",
          content: [],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
          },
          stopReason,
          errorMessage: message,
          timestamp: Date.now()
        };
        stream.push({ type: "error", reason: stopReason, error: output });
        stream.end(output);
      }
    })();
    return stream;
  };
}
var glmBaseModels = [
  {
    id: "glm-5.1",
    name: "GLM 5.1",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204800,
    maxTokens: 131072
  },
  {
    id: "glm-5-turbo",
    name: "GLM 5 Turbo",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204800,
    maxTokens: 131072
  },
  {
    id: "glm-5",
    name: "GLM 5",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204800,
    maxTokens: 131072
  },
  {
    id: "glm-4.7",
    name: "GLM 4.7",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204800,
    maxTokens: 131072
  },
  {
    id: "glm-4.7-flash",
    name: "GLM 4.7 Flash",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204800,
    maxTokens: 131072
  },
  {
    id: "glm-4.7-flashx",
    name: "GLM 4.7 FlashX",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204800,
    maxTokens: 131072
  },
  {
    id: "glm-4.6",
    name: "GLM 4.6",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204800,
    maxTokens: 131072
  },
  {
    id: "glm-4.5-air",
    name: "GLM 4.5 Air",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 98304
  },
  {
    id: "glm-4.5-airx",
    name: "GLM 4.5 AirX",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 98304
  },
  {
    id: "glm-4.5-flash",
    name: "GLM 4.5 Flash",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 98304
  },
  {
    id: "glm-4-flash-250414",
    name: "GLM 4 Flash 250414",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384
  },
  {
    id: "glm-4-flashx-250414",
    name: "GLM 4 FlashX 250414",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384
  }
];
var glmModels = glmBaseModels.map((model) => ({
  ...model,
  compat: ZHIPU_OPENAI_COMPAT
}));
function normalizeBigModelModelId(value) {
  const trimmed = value.trim();
  if (trimmed.toLowerCase().startsWith("glm-")) {
    return trimmed.toLowerCase();
  }
  return trimmed;
}
function resolveModelId(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return normalizeBigModelModelId(candidate);
    }
  }
  return void 0;
}
function buildCustomModelDefinition(modelId, compat = OPENAI_COMPAT) {
  return {
    id: modelId,
    name: modelId,
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128e3,
    maxTokens: 8192,
    compat
  };
}
function resolveOpenAiCompatibleModelDefinition(modelId, baseUrl) {
  const compat = isZhipuOpenAiCompatBaseUrl(baseUrl) ? ZHIPU_OPENAI_COMPAT : OPENAI_COMPAT;
  const base = glmBaseModels.find((model) => model.id === modelId);
  return base ? { ...base, compat } : buildCustomModelDefinition(modelId, compat);
}
function resolveOpenAiResponsesModelDefinition(modelId) {
  const base = glmBaseModels.find((model) => model.id === modelId);
  if (base) {
    const { compat: _compat, ...withoutCompat } = base;
    return withoutCompat;
  }
  return buildCustomModelDefinition(modelId);
}
function resolveAnthropicModels(requestedModelId) {
  if (glmModels.some((model) => model.id === requestedModelId)) {
    return glmModels;
  }
  return [
    ...glmModels,
    buildCustomModelDefinition(requestedModelId)
  ];
}
function normalizeProvider(value) {
  if (typeof value !== "object" || value === null) return void 0;
  const maybe = value;
  const apiKey = typeof maybe.apiKey === "string" ? maybe.apiKey : void 0;
  const baseURL = typeof maybe.baseURL === "string" ? maybe.baseURL : void 0;
  const endpoint = typeof maybe.endpoint === "string" ? maybe.endpoint : void 0;
  if (!apiKey && !baseURL && !endpoint) return void 0;
  return { apiKey, baseURL, endpoint };
}
function readPersistedConfig() {
  const configPath = join(homedir(), ".glm", "config.json");
  try {
    const contents = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(contents);
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    const providers = parsed.providers;
    return {
      defaultModel: typeof parsed.defaultModel === "string" ? parsed.defaultModel : void 0,
      providers: {
        glm: normalizeProvider(providers?.glm),
        "openai-compatible": normalizeProvider(providers?.["openai-compatible"])
      }
    };
  } catch {
    return {};
  }
}
var persistedConfig = readPersistedConfig();
function resolveProviderSettings(options) {
  const envApiKey = options.envApiKey?.trim();
  const persistedApiKey = options.persisted?.apiKey?.trim();
  const envBaseUrl = options.envBaseUrl?.trim();
  const persistedBaseUrl = options.persisted?.baseURL?.trim();
  const apiKey = envApiKey || persistedApiKey;
  const baseUrl = envBaseUrl || persistedBaseUrl || options.defaultBaseUrl;
  return { apiKey, baseUrl };
}
function resolveConfigDefaultModel() {
  return persistedConfig.defaultModel;
}
function index_default(pi) {
  const glmPresetBaseUrl = resolveGlmBaseUrlPreset(
    process.env.GLM_ENDPOINT,
    persistedConfig.providers?.glm?.endpoint
  );
  const glmSettings = resolveProviderSettings({
    envApiKey: process.env.GLM_API_KEY,
    envBaseUrl: process.env.GLM_BASE_URL,
    persisted: persistedConfig.providers?.glm,
    defaultBaseUrl: glmPresetBaseUrl ?? GLM_BASE_URL_PRESETS["bigmodel-coding"]
  });
  if (glmSettings.apiKey) {
    pi.registerProvider("glm", {
      baseUrl: glmSettings.baseUrl,
      apiKey: glmSettings.apiKey,
      api: "openai-completions",
      models: glmModels
    });
  }
  const openaiSettings = resolveProviderSettings({
    envApiKey: process.env.OPENAI_API_KEY,
    envBaseUrl: process.env.OPENAI_BASE_URL,
    persisted: persistedConfig.providers?.["openai-compatible"],
    defaultBaseUrl: "https://api.openai.com/v1"
  });
  if (openaiSettings.apiKey) {
    const openaiModelId = resolveModelId(
      process.env.OPENAI_MODEL,
      process.env.GLM_MODEL,
      resolveConfigDefaultModel()
    ) ?? "glm-5.1";
    pi.registerProvider("openai-compatible", {
      baseUrl: openaiSettings.baseUrl,
      apiKey: openaiSettings.apiKey,
      api: "openai-completions",
      models: [
        resolveOpenAiCompatibleModelDefinition(openaiModelId, openaiSettings.baseUrl)
      ]
    });
    pi.registerProvider("openai-responses", {
      baseUrl: openaiSettings.baseUrl,
      apiKey: openaiSettings.apiKey,
      api: "openai-responses",
      models: [
        resolveOpenAiResponsesModelDefinition(openaiModelId)
      ]
    });
  }
  if (process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_MODEL || process.env.ANTHROPIC_BASE_URL) {
    const anthropicModelId = resolveModelId(
      process.env.ANTHROPIC_MODEL,
      process.env.GLM_MODEL,
      resolveConfigDefaultModel()
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
      ...isModelscope ? { streamSimple: createStreamFirstModelscopeAnthropicApi() } : {},
      models: resolveAnthropicModels(anthropicModelId)
    });
  }
}
export {
  index_default as default,
  resolveAnthropicModels,
  resolveProviderSettings
};
