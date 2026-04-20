import {
  getGenericOpenAiCompatibleCaps,
  getStandardGlmModel,
  type EffectiveModelCaps,
} from "./glm-catalog.js";
import { resolveCanonicalGlmModelId } from "./glm-alias.js";
import {
  resolveGlmPlatformRoute,
  type GlmPlatformRoute,
} from "./glm-platforms.js";
import {
  resolveVariantOverlay,
  type GlmUpstreamVendor,
} from "./glm-variants.js";

export type ResolutionConfidence = "high" | "medium" | "low";
export type ModelAliasEvidence = "matched" | "none" | "ambiguous";
export type PayloadPatchPolicy = "glm-native" | "safe-openai-compatible";

export type ResolutionEvidence = {
  modelAlias: ModelAliasEvidence;
  platform: GlmPlatformRoute;
  upstreamVendor: GlmUpstreamVendor;
  confidence: ResolutionConfidence;
};

export type ResolvedGlmProfile = {
  selectedModelId: string;
  canonicalModelId?: string;
  evidence: ResolutionEvidence;
  payloadPatchPolicy: PayloadPatchPolicy;
  effectiveCaps: EffectiveModelCaps;
};

export type ResolveGlmProfileInput = {
  modelId: string;
  baseUrl?: string;
};

function mergeCaps(
  base: EffectiveModelCaps,
  overlay?: Partial<EffectiveModelCaps>,
): EffectiveModelCaps {
  if (!overlay) return { ...base };
  return { ...base, ...overlay };
}

function resolveConfidence(
  canonicalModelId: string | undefined,
  platform: GlmPlatformRoute,
): ResolutionConfidence {
  if (
    canonicalModelId &&
    (platform === "native-bigmodel" || platform === "native-zai")
  ) {
    return "high";
  }

  if (canonicalModelId) {
    return "medium";
  }

  return "low";
}

export function resolveGlmProfile(
  input: ResolveGlmProfileInput,
): ResolvedGlmProfile {
  const platform = resolveGlmPlatformRoute(input.baseUrl);
  const canonicalModelId = resolveCanonicalGlmModelId(input.modelId);
  const canonicalModel = canonicalModelId
    ? getStandardGlmModel(canonicalModelId)
    : undefined;

  const baseCaps = canonicalModel ?? getGenericOpenAiCompatibleCaps();
  const variant = resolveVariantOverlay(platform, input.modelId, canonicalModelId);
  const effectiveCaps = mergeCaps(baseCaps, variant.caps);

  const payloadPatchPolicy: PayloadPatchPolicy =
    canonicalModelId &&
    (platform === "native-bigmodel" || platform === "native-zai")
      ? "glm-native"
      : "safe-openai-compatible";

  return {
    selectedModelId: input.modelId,
    canonicalModelId,
    evidence: {
      modelAlias: canonicalModelId ? "matched" : "none",
      platform,
      upstreamVendor: variant.upstreamVendor,
      confidence: resolveConfidence(canonicalModelId, platform),
    },
    payloadPatchPolicy,
    effectiveCaps,
  };
}
