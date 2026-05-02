import { getCatalogModelProfile, getStandardGlmModels } from "./model-family-registry.js";
import { resolveRuntimeModelProfile } from "./runtime-model-profile.js";
import type { GlmProfileOverrideRule } from "./runtime-model-profile.js";

type ThinkingLevelMap = Record<string, string | null>;

const OPENAI_COMPAT = {
  supportsDeveloperRole: false,
} as const;

const ZHIPU_OPENAI_COMPAT = {
  supportsDeveloperRole: false,
  supportsStore: false,
  supportsUsageInStreaming: false,
  supportsStrictMode: false,
  supportsReasoningEffort: false,
  maxTokensField: "max_tokens",
  thinkingFormat: "zai",
  zaiToolStream: false,
} as const;

const QWEN_OPENAI_COMPAT = {
  supportsDeveloperRole: false,
  supportsReasoningEffort: false,
  maxTokensField: "max_tokens",
  thinkingFormat: "qwen-chat-template",
} as const;

function isKnownThinkingFamily(profile: ReturnType<typeof resolveRuntimeModelProfile>): boolean {
  return profile.family === "glm" || profile.family === "qwen";
}

function resolveThinkingLevelMap(
  profile: ReturnType<typeof resolveRuntimeModelProfile>,
): ThinkingLevelMap | undefined {
  if (!profile.effectiveCaps.supportsThinking) {
    return undefined;
  }

  if (!isKnownThinkingFamily(profile)) {
    return undefined;
  }

  return {
    minimal: null,
    low: null,
    medium: null,
  };
}

function resolveOpenAiCompat(profile: ReturnType<typeof resolveRuntimeModelProfile>) {
  if (profile.patchPipeline.zhipuNative) {
    return { ...ZHIPU_OPENAI_COMPAT, zaiToolStream: profile.effectiveCaps.supportsToolStream };
  }

  if (profile.family === "qwen") {
    return { ...OPENAI_COMPAT, ...QWEN_OPENAI_COMPAT };
  }

  return OPENAI_COMPAT;
}

function buildDefinition(args: {
  provider: string;
  modelId: string;
  baseUrl: string;
  overrides?: GlmProfileOverrideRule[];
  includeCompat?: boolean;
}) {
  const profile = resolveRuntimeModelProfile({
    provider: args.provider,
    modelId: args.modelId,
    baseUrl: args.baseUrl,
    overrides: args.overrides,
  });
  const canonical = profile.canonicalModelId
    ? getCatalogModelProfile(profile.canonicalModelId)
    : undefined;
  const thinkingLevelMap = resolveThinkingLevelMap(profile);

  return {
    id: args.modelId,
    name: canonical?.displayName ?? args.modelId,
    reasoning: profile.effectiveCaps.supportsThinking,
    input: profile.effectiveModalities,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: profile.effectiveCaps.contextWindow,
    maxTokens: profile.effectiveCaps.maxOutputTokens,
    ...(args.includeCompat ? { compat: resolveOpenAiCompat(profile) } : {}),
    ...(thinkingLevelMap ? { thinkingLevelMap } : {}),
  };
}

export function resolveNativeGlmProviderModels(args: {
  baseUrl: string;
  overrides?: GlmProfileOverrideRule[];
}) {
  return getStandardGlmModels().map((model) =>
    buildDefinition({
      provider: "glm",
      modelId: model.id,
      baseUrl: args.baseUrl,
      overrides: args.overrides,
      includeCompat: true,
    }),
  );
}

export function resolveOpenAiCompatibleModelDefinition(args: {
  modelId: string;
  baseUrl: string;
  overrides?: GlmProfileOverrideRule[];
}) {
  return buildDefinition({
    provider: "openai-compatible",
    modelId: args.modelId,
    baseUrl: args.baseUrl,
    overrides: args.overrides,
    includeCompat: true,
  });
}

export function resolveOpenAiResponsesModelDefinition(args: {
  modelId: string;
  baseUrl: string;
  overrides?: GlmProfileOverrideRule[];
}) {
  return buildDefinition({
    provider: "openai-responses",
    modelId: args.modelId,
    baseUrl: args.baseUrl,
    overrides: args.overrides,
  });
}

export function resolveAnthropicModels(args: {
  requestedModelId: string;
  baseUrl: string;
  overrides?: GlmProfileOverrideRule[];
}) {
  const standardModels = getStandardGlmModels().map((model) =>
    buildDefinition({
      provider: "anthropic",
      modelId: model.id,
      baseUrl: args.baseUrl,
      overrides: args.overrides,
    }),
  );

  if (standardModels.some((model) => model.id === args.requestedModelId)) {
    return standardModels;
  }

  return [
    ...standardModels,
    buildDefinition({
      provider: "anthropic",
      modelId: args.requestedModelId,
      baseUrl: args.baseUrl,
      overrides: args.overrides,
    }),
  ];
}
