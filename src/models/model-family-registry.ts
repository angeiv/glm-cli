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

export type ModelFamilyVariantArgs = {
  gateway: GlmPlatformRoute;
  upstreamVendor: GlmUpstreamVendor;
  canonicalModelId?: string;
};

export type ModelFamilyAdapter = {
  id: Exclude<RuntimeModelFamily, "generic">;
  listCatalogModels: () => CatalogModelProfile[];
  getCatalogModelProfile: (id: string) => CatalogModelProfile | undefined;
  resolveCanonicalModelId: (modelId: string) => string | undefined;
  resolveVariantCaps: (args: ModelFamilyVariantArgs) => Partial<EffectiveModelCaps>;
};

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

const MODEL_FAMILY_ADAPTERS: ModelFamilyAdapter[] = [
  {
    id: "glm",
    listCatalogModels: () => getStandardGlmModels(),
    getCatalogModelProfile: (id) => getGlmCatalogModelProfile(id),
    resolveCanonicalModelId: (modelId) => resolveCanonicalGlmModelId(modelId),
    resolveVariantCaps: (args) => resolveGlmVariantCaps(args),
  },
  {
    id: "qwen",
    listCatalogModels: () => getQwenCatalogModels(),
    getCatalogModelProfile: (id) => getQwenCatalogModelProfile(id),
    resolveCanonicalModelId: (modelId) => resolveCanonicalQwenModelId(modelId),
    resolveVariantCaps: (args) => resolveQwenVariantCaps(args),
  },
];

export function listModelFamilyAdapters(): ModelFamilyAdapter[] {
  return [...MODEL_FAMILY_ADAPTERS];
}

export function getModelFamilyAdapter(
  family: Exclude<RuntimeModelFamily, "generic">,
): ModelFamilyAdapter | undefined {
  return MODEL_FAMILY_ADAPTERS.find((adapter) => adapter.id === family);
}

export function getCatalogModelProfile(id: string): CatalogModelProfile | undefined {
  for (const adapter of MODEL_FAMILY_ADAPTERS) {
    const profile = adapter.getCatalogModelProfile(id);
    if (profile) {
      return profile;
    }
  }

  return undefined;
}

export function getCatalogModelFamily(id?: string): RuntimeModelFamily {
  if (!id) return "generic";

  for (const adapter of MODEL_FAMILY_ADAPTERS) {
    if (adapter.getCatalogModelProfile(id)) {
      return adapter.id;
    }
  }

  return "generic";
}

export function getStandardCatalogModels(): CatalogModelProfile[] {
  return MODEL_FAMILY_ADAPTERS.flatMap((adapter) => adapter.listCatalogModels());
}

export function resolveCanonicalCatalogModelId(modelId: string): string | undefined {
  for (const adapter of MODEL_FAMILY_ADAPTERS) {
    const canonicalModelId = adapter.resolveCanonicalModelId(modelId);
    if (canonicalModelId) {
      return canonicalModelId;
    }
  }

  return undefined;
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
  const adapter = args.family === "generic" ? undefined : getModelFamilyAdapter(args.family);
  return adapter?.resolveVariantCaps(args) ?? {};
}

export { getStandardGlmModel, getStandardGlmModels };
export type { StandardGlmModel };
