import type {
  CatalogModelProfile,
  EffectiveModelCaps,
  GlmInputModality,
  GlmPlatformRoute,
  GlmUpstreamVendor,
  RuntimeModelFamily,
  StandardGlmModel,
} from "./model-profile-types.js";
import {
  getGlmCatalogModelProfile,
  getStandardGlmModel,
  getStandardGlmModels,
  resolveCanonicalGlmModelId,
  resolveGlmVariantCaps,
} from "./model-families/glm.js";
import {
  getQwenCatalogModelProfile,
  getQwenCatalogModels,
  resolveCanonicalQwenModelId,
  resolveQwenVariantCaps,
} from "./model-families/qwen.js";

const GENERIC_OPENAI_COMPATIBLE_CAPS: EffectiveModelCaps = {
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
  supportsThinking: false,
  defaultThinkingMode: "disabled",
  supportsPreservedThinking: false,
  supportsStreaming: true,
  supportsToolCall: true,
  supportsToolStream: false,
  supportsCache: false,
  supportsStructuredOutput: false,
  supportsMcp: false,
};

const GENERIC_ANTHROPIC_COMPATIBLE_CAPS: EffectiveModelCaps = {
  ...GENERIC_OPENAI_COMPATIBLE_CAPS,
  supportsThinking: true,
  defaultThinkingMode: "enabled",
};

const GENERIC_OPENAI_COMPATIBLE_MODALITIES: GlmInputModality[] = ["text", "image"];

export function getCatalogModelProfile(id: string): CatalogModelProfile | undefined {
  return getGlmCatalogModelProfile(id) ?? getQwenCatalogModelProfile(id);
}

export function getCatalogModelFamily(id?: string): RuntimeModelFamily {
  if (!id) return "generic";
  if (getStandardGlmModel(id)) return "glm";
  if (getQwenCatalogModelProfile(id)) return "qwen";
  return "generic";
}

export function getStandardCatalogModels(): CatalogModelProfile[] {
  return [...getStandardGlmModels(), ...getQwenCatalogModels()];
}

export function resolveCanonicalCatalogModelId(modelId: string): string | undefined {
  return resolveCanonicalGlmModelId(modelId) ?? resolveCanonicalQwenModelId(modelId);
}

export function getGenericOpenAiCompatibleCaps(): EffectiveModelCaps {
  return { ...GENERIC_OPENAI_COMPATIBLE_CAPS };
}

export function getGenericAnthropicCompatibleCaps(): EffectiveModelCaps {
  return { ...GENERIC_ANTHROPIC_COMPATIBLE_CAPS };
}

export function getGenericOpenAiCompatibleModalities(): GlmInputModality[] {
  return [...GENERIC_OPENAI_COMPATIBLE_MODALITIES];
}

export function resolveCatalogVariantCaps(args: {
  family: RuntimeModelFamily;
  gateway: GlmPlatformRoute;
  upstreamVendor: GlmUpstreamVendor;
  canonicalModelId?: string;
}): Partial<EffectiveModelCaps> {
  if (args.family === "glm") {
    return resolveGlmVariantCaps(args);
  }

  if (args.family === "qwen") {
    return resolveQwenVariantCaps(args);
  }

  return {};
}

export { getStandardGlmModel, getStandardGlmModels };
export type { StandardGlmModel };
