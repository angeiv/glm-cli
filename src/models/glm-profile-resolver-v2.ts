import type {
  EffectiveModelCaps,
  GlmPlatformRoute,
  GlmUpstreamVendor,
  PayloadPatchPolicy,
  ResolvedGlmProfile,
  ResolveGlmProfileInput,
  ResolutionConfidence,
} from "./glm-profile-core.js";
import {
  getGenericOpenAiCompatibleCaps,
  getStandardGlmModel,
  resolveCanonicalGlmModelId,
  resolveGlmPlatformRoute,
  resolveGlmUpstreamVendor,
  resolveVariantOverlay,
} from "./glm-profile-core.js";

export type GlmProfileRuleMatch = {
  provider?: string;
  baseUrl?: string;
  modelId?: string;
  canonicalModelId?: string;
  platform?: string;
  upstreamVendor?: string;
};

export type GlmProfileOverrideRule = {
  match: GlmProfileRuleMatch;
  canonicalModelId?: string;
  payloadPatchPolicy?: PayloadPatchPolicy;
  caps?: Partial<EffectiveModelCaps>;
};

export type ResolveGlmProfileV2Input = ResolveGlmProfileInput & {
  provider?: string;
  overrides?: GlmProfileOverrideRule[];
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeModelId(value: string): string {
  return normalize(value)
    .replace(/[_\s]+/g, "-")
    .replace(/:+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/-+/g, "-");
}

function extractModelIdCandidates(modelId: string): string[] {
  const normalized = normalizeModelId(modelId);
  const candidates = new Set<string>();
  if (normalized) {
    candidates.add(normalized);
  }

  const lastGlmIndex = normalized.lastIndexOf("glm");
  if (lastGlmIndex >= 0) {
    candidates.add(normalized.slice(lastGlmIndex));
  }

  const slashSegments = normalized.split("/").filter(Boolean);
  if (slashSegments.length > 0) {
    candidates.add(slashSegments[slashSegments.length - 1]);
  }

  return [...candidates];
}

function normalizeBaseUrl(value: string): string {
  return normalize(value).replace(/\/+$/g, "");
}

function extractBaseUrlCandidates(baseUrl: string): string[] {
  const normalized = normalizeBaseUrl(baseUrl);
  const candidates = new Set<string>();
  if (normalized) {
    candidates.add(normalized);
  }

  try {
    const parsed = new URL(baseUrl);
    if (parsed.hostname) {
      candidates.add(parsed.hostname.toLowerCase());
    }
  } catch {
    // Ignore.
  }

  return [...candidates];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileGlob(pattern: string): RegExp {
  const normalized = normalize(pattern);
  const source = normalized
    .split("*")
    .map((segment) => escapeRegExp(segment))
    .join(".*");
  return new RegExp(`^${source}$`, "i");
}

function matchesGlob(value: string, pattern: string): boolean {
  if (!pattern.trim()) return true;
  return compileGlob(pattern).test(value);
}

function matchesAnyCandidate(candidates: string[], pattern: string): boolean {
  if (!pattern.trim()) return true;
  const compiled = compileGlob(pattern);
  return candidates.some((candidate) => compiled.test(candidate));
}

type GlmResolutionContext = {
  provider?: string;
  baseUrl?: string;
  modelId: string;
  platform: GlmPlatformRoute;
  upstreamVendor: GlmUpstreamVendor;
  canonicalModelId?: string;
};

function matchesOverride(rule: GlmProfileOverrideRule, context: GlmResolutionContext): boolean {
  const match = rule.match;

  if (match.provider) {
    if (!context.provider) return false;
    if (!matchesGlob(normalize(context.provider), match.provider)) return false;
  }

  if (match.baseUrl) {
    const baseUrl = context.baseUrl;
    if (!baseUrl) return false;
    if (!matchesAnyCandidate(extractBaseUrlCandidates(baseUrl), match.baseUrl)) return false;
  }

  if (match.modelId) {
    if (!matchesAnyCandidate(extractModelIdCandidates(context.modelId), match.modelId)) return false;
  }

  if (match.platform) {
    if (!matchesGlob(context.platform, match.platform)) return false;
  }

  if (match.upstreamVendor) {
    if (!matchesGlob(context.upstreamVendor, match.upstreamVendor)) return false;
  }

  if (match.canonicalModelId) {
    if (!context.canonicalModelId) return false;
    if (!matchesGlob(context.canonicalModelId, match.canonicalModelId)) return false;
  }

  return true;
}

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

function applyOverrides(context: GlmResolutionContext, rules: GlmProfileOverrideRule[] | undefined): {
  canonicalModelId?: string;
  payloadPatchPolicy?: PayloadPatchPolicy;
  caps?: Partial<EffectiveModelCaps>;
} {
  if (!rules || rules.length === 0) {
    return {};
  }

  for (const rule of rules) {
    if (!matchesOverride(rule, context)) continue;
    return {
      canonicalModelId: rule.canonicalModelId,
      payloadPatchPolicy: rule.payloadPatchPolicy,
      caps: rule.caps,
    };
  }

  return {};
}

export function resolveGlmProfileV2(input: ResolveGlmProfileV2Input): ResolvedGlmProfile {
  const platform = resolveGlmPlatformRoute(input.baseUrl);
  const upstreamVendor = resolveGlmUpstreamVendor(platform, input.modelId);

  const baseCanonical = resolveCanonicalGlmModelId(input.modelId);
  const baseContext: GlmResolutionContext = {
    provider: input.provider ? normalize(input.provider) : undefined,
    baseUrl: input.baseUrl,
    modelId: input.modelId,
    platform,
    upstreamVendor,
    canonicalModelId: baseCanonical,
  };

  const overrides = applyOverrides(baseContext, input.overrides);
  const canonicalModelId = overrides.canonicalModelId ?? baseCanonical;
  const canonicalModel = canonicalModelId ? getStandardGlmModel(canonicalModelId) : undefined;

  const baseCaps = canonicalModel ?? getGenericOpenAiCompatibleCaps();
  const variant = resolveVariantOverlay(platform, input.modelId, canonicalModelId);
  const effectiveCaps = mergeCaps(mergeCaps(baseCaps, variant.caps), overrides.caps);

  const defaultPayloadPolicy: PayloadPatchPolicy =
    canonicalModelId &&
    (platform === "native-bigmodel" || platform === "native-zai")
      ? "glm-native"
      : "safe-openai-compatible";
  const payloadPatchPolicy = overrides.payloadPatchPolicy ?? defaultPayloadPolicy;

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

