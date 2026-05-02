import {
  getCatalogModelProfile,
  getGenericOpenAiCompatibleCaps,
  getGenericOpenAiCompatibleModalities,
  getStandardGlmModel,
  getStandardGlmModels,
  resolveCanonicalCatalogModelId,
  resolveCatalogVariantCaps,
} from "./model-family-registry.js";
import {
  resolveGlmPlatformRoute,
  resolveGlmUpstreamVendor,
  resolveRuntimeModelProfile,
} from "./runtime-model-profile.js";
import type {
  CatalogModelProfile,
  EffectiveModelCaps,
  GlmInputModality,
  GlmModelFamily,
  GlmModelSource,
  GlmModelTier,
  GlmPlatformRoute,
  GlmThinkingMode,
  GlmUpstreamVendor,
  ModelAliasEvidence,
  PayloadPatchPolicy,
  ResolutionEvidence,
  ResolvedGlmProfile,
  ResolveGlmProfileInput,
  ResolutionConfidence,
  RuntimeModelFamily,
  StandardGlmModel,
  VariantOverlay,
} from "./model-profile-types.js";

export type {
  CatalogModelProfile,
  EffectiveModelCaps,
  GlmInputModality,
  GlmModelFamily,
  GlmModelSource,
  GlmModelTier,
  GlmPlatformRoute,
  GlmThinkingMode,
  GlmUpstreamVendor,
  ModelAliasEvidence,
  PayloadPatchPolicy,
  ResolutionEvidence,
  ResolvedGlmProfile,
  ResolveGlmProfileInput,
  ResolutionConfidence,
  RuntimeModelFamily,
  StandardGlmModel,
  VariantOverlay,
};

export {
  getCatalogModelProfile,
  getGenericOpenAiCompatibleCaps,
  getGenericOpenAiCompatibleModalities,
  getStandardGlmModel,
  getStandardGlmModels,
  resolveGlmPlatformRoute,
  resolveGlmUpstreamVendor,
};

export function resolveCanonicalGlmModelId(modelId: string): string | undefined {
  const canonical = resolveCanonicalCatalogModelId(modelId);
  return canonical?.startsWith("glm-") ? canonical : undefined;
}

export function resolveCanonicalCatalogModelIdCompat(modelId: string): string | undefined {
  return resolveCanonicalCatalogModelId(modelId);
}

export function resolveVariantOverlay(
  platform: GlmPlatformRoute,
  modelId: string,
  canonicalModelId?: string,
): VariantOverlay {
  const upstreamVendor = resolveGlmUpstreamVendor(platform, modelId);
  return {
    upstreamVendor,
    caps: resolveCatalogVariantCaps({
      family: canonicalModelId?.startsWith("qwen/") ? "qwen" : canonicalModelId ? "glm" : "generic",
      gateway: platform,
      upstreamVendor,
      canonicalModelId,
    }),
  };
}

export function resolveGlmProfile(input: ResolveGlmProfileInput): ResolvedGlmProfile {
  const profile = resolveRuntimeModelProfile(input);
  return {
    selectedModelId: profile.selectedModelId,
    canonicalModelId: profile.canonicalModelId,
    evidence: profile.evidence,
    payloadPatchPolicy: profile.payloadPatchPolicy,
    effectiveCaps: profile.effectiveCaps,
    effectiveModalities: profile.effectiveModalities,
  };
}
