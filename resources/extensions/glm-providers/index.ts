import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const glmModels = [
  {
    id: "glm-5",
    name: "GLM 5",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_192,
  },
  {
    id: "glm-4.5",
    name: "GLM 4.5",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_192,
  },
  {
    id: "glm-4.5-air",
    name: "GLM 4.5 Air",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_192,
  },
];

type PersistedProviderConfig = {
  apiKey?: string;
  baseURL?: string;
};

type PersistedConfig = {
  defaultModel?: string;
  providers?: {
    glmOfficial?: PersistedProviderConfig;
    openAICompatible?: PersistedProviderConfig;
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
        glmOfficial: normalizeProvider(providers?.glmOfficial),
        openAICompatible: normalizeProvider(providers?.openAICompatible),
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
  const apiKey = options.envApiKey ?? options.persisted?.apiKey;
  const baseUrl = options.envBaseUrl ?? options.persisted?.baseURL ?? options.defaultBaseUrl;
  return { apiKey, baseUrl };
}

function resolveConfigDefaultModel(): string | undefined {
  return persistedConfig.defaultModel;
}

export default function (pi: ExtensionAPI) {
  const glmSettings = resolveProviderSettings({
    envApiKey: process.env.GLM_API_KEY,
    envBaseUrl: process.env.GLM_BASE_URL,
    persisted: persistedConfig.providers?.glmOfficial,
    defaultBaseUrl: "https://open.bigmodel.cn/api/coding/paas/v4/",
  });

  if (glmSettings.apiKey) {
    pi.registerProvider("glm-official", {
      baseUrl: glmSettings.baseUrl,
      apiKey: glmSettings.apiKey,
      api: "openai-completions",
      models: glmModels,
    });
  }

  const openaiSettings = resolveProviderSettings({
    envApiKey: process.env.OPENAI_API_KEY,
    envBaseUrl: process.env.OPENAI_BASE_URL,
    persisted: persistedConfig.providers?.openAICompatible,
    defaultBaseUrl: "https://api.openai.com/v1",
  });

  if (openaiSettings.apiKey) {
    const openaiModelId = process.env.OPENAI_MODEL ?? process.env.GLM_MODEL ?? resolveConfigDefaultModel() ?? "glm-5";
    pi.registerProvider("openai-compatible", {
      baseUrl: openaiSettings.baseUrl,
      apiKey: openaiSettings.apiKey,
      api: "openai-completions",
      models: [
        {
          id: openaiModelId,
          name: openaiModelId,
          reasoning: true,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128_000,
          maxTokens: 8_192,
        },
      ],
    });
  }

  if (process.env.ANTHROPIC_AUTH_TOKEN) {
    pi.registerProvider("anthropic", {
      baseUrl: process.env.ANTHROPIC_BASE_URL ?? "https://open.bigmodel.cn/api/anthropic",
      apiKey: "ANTHROPIC_AUTH_TOKEN",
      api: "anthropic-messages",
      models: glmModels,
    });
  }
}
