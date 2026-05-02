import type {
  EffectiveModelCaps,
  GlmInputModality,
  PayloadPatchPolicy,
  ResolvedRuntimeModelProfile,
  ResolveGlmProfileInput,
  ResolutionConfidence,
} from "./model-profile-types.js";
import {
  getCatalogModelFamily,
  getCatalogModelProfile,
  getGenericOpenAiCompatibleModalities,
  getModelFamilyAdapter,
  getStandardGlmModel,
  resolveCanonicalCatalogModelId,
  resolveCatalogVariantCaps,
} from "./model-family-registry.js";
import {
  resolveGatewayUpstreamVendor,
  resolveModelGatewayRoute,
} from "./model-gateway-registry.js";
import { getTransportGenericCaps, resolveModelTransport } from "./model-transport-registry.js";

export type GlmProfileRuleMatch = {
  provider?: string;
  api?: string;
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
  modalities?: GlmInputModality[];
  caps?: Partial<EffectiveModelCaps>;
};

export type ResolveRuntimeModelProfileInput = ResolveGlmProfileInput & {
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

function normalizeBaseUrl(value: string): string {
  return normalize(value).replace(/\/+$/g, "");
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

function matchesAnyCandidate(candidates: string[], pattern: string): boolean {
  if (!pattern.trim()) return true;
  const compiled = compileGlob(pattern);
  return candidates.some((candidate) => compiled.test(candidate));
}

type GlmResolutionContext = {
  provider?: string;
  providerCandidates?: string[];
  api?: string;
  baseUrl?: string;
  modelId: string;
  platform: ResolvedRuntimeModelProfile["gateway"];
  upstreamVendor: ResolvedRuntimeModelProfile["evidence"]["upstreamVendor"];
  canonicalModelId?: string;
};

function matchesOverride(rule: GlmProfileOverrideRule, context: GlmResolutionContext): boolean {
  const match = rule.match;

  if (match.provider) {
    const providerCandidates = context.providerCandidates?.filter(Boolean) ?? [];
    if (providerCandidates.length === 0) return false;
    if (!providerCandidates.some((candidate) => matchesGlob(candidate, match.provider!))) {
      return false;
    }
  }

  if (match.api) {
    if (!context.api) return false;
    if (!matchesGlob(normalize(context.api), match.api)) return false;
  }

  if (match.baseUrl) {
    if (!context.baseUrl) return false;
    if (!matchesAnyCandidate(extractBaseUrlCandidates(context.baseUrl), match.baseUrl)) {
      return false;
    }
  }

  if (match.modelId) {
    if (!matchesAnyCandidate(extractModelIdCandidates(context.modelId), match.modelId)) {
      return false;
    }
  }

  if (match.platform && !matchesGlob(context.platform, match.platform)) {
    return false;
  }

  if (match.upstreamVendor && !matchesGlob(context.upstreamVendor, match.upstreamVendor)) {
    return false;
  }

  if (match.canonicalModelId) {
    if (!context.canonicalModelId) return false;
    if (!matchesGlob(context.canonicalModelId, match.canonicalModelId)) return false;
  }

  return true;
}

function applyOverrides(
  context: GlmResolutionContext,
  rules: GlmProfileOverrideRule[] | undefined,
): {
  canonicalModelId?: string;
  payloadPatchPolicy?: PayloadPatchPolicy;
  modalities?: GlmInputModality[];
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
      modalities: rule.modalities,
      caps: rule.caps,
    };
  }

  return {};
}

function mergeCaps(
  base: EffectiveModelCaps,
  overlay?: Partial<EffectiveModelCaps>,
): EffectiveModelCaps {
  if (!overlay) return { ...base };
  return { ...base, ...overlay };
}

function mergeModalities(
  base: GlmInputModality[],
  overlay?: GlmInputModality[],
): GlmInputModality[] {
  if (!overlay) return [...base];
  return [...overlay];
}

function resolveConfidence(
  canonicalModelId: string | undefined,
  gateway: ResolvedRuntimeModelProfile["gateway"],
): ResolutionConfidence {
  if (canonicalModelId && (gateway === "native-bigmodel" || gateway === "native-zai")) {
    return "high";
  }

  if (canonicalModelId) {
    return "medium";
  }

  return "low";
}

export function resolveProviderTransport(api?: string) {
  return resolveModelTransport(api);
}

export function resolveGlmPlatformRoute(providerOrBaseUrl?: string, maybeBaseUrl?: string) {
  return resolveModelGatewayRoute(providerOrBaseUrl, maybeBaseUrl);
}

export function resolveGlmUpstreamVendor(
  gateway: ResolvedRuntimeModelProfile["gateway"],
  modelId: string,
) {
  return resolveGatewayUpstreamVendor(gateway, modelId);
}

export function resolveRuntimeModelProfile(
  input: ResolveRuntimeModelProfileInput,
): ResolvedRuntimeModelProfile {
  const api =
    input.api ??
    (input.provider === "anthropic"
      ? "anthropic"
      : input.provider === "openai-responses"
        ? "openai-responses"
        : "openai-compatible");
  const providerForGateway =
    input.provider === "anthropic" ||
    input.provider === "openai-compatible" ||
    input.provider === "openai-responses"
      ? undefined
      : input.provider;
  const providerCandidates = new Set<string>();
  if (providerForGateway) {
    providerCandidates.add(normalize(providerForGateway));
  }
  if (input.provider) {
    providerCandidates.add(normalize(input.provider));
  }

  const detectedGateway = resolveModelGatewayRoute(undefined, input.baseUrl);
  const gateway = resolveModelGatewayRoute(providerForGateway, input.baseUrl);
  const transport = resolveModelTransport(api);
  const upstreamVendor = resolveGatewayUpstreamVendor(gateway, input.modelId);
  const baseCanonicalModelId = resolveCanonicalCatalogModelId(input.modelId);

  const baseContext: GlmResolutionContext = {
    provider: providerForGateway ? normalize(providerForGateway) : undefined,
    providerCandidates: [...providerCandidates],
    api: api ? normalize(api) : undefined,
    baseUrl: input.baseUrl,
    modelId: input.modelId,
    platform: gateway,
    upstreamVendor,
    canonicalModelId: baseCanonicalModelId,
  };

  const overrides = applyOverrides(baseContext, input.overrides);
  const canonicalModelId = overrides.canonicalModelId ?? baseCanonicalModelId;
  const family = getCatalogModelFamily(canonicalModelId);
  const familyAdapter = family === "generic" ? undefined : getModelFamilyAdapter(family);
  const canonicalModel =
    canonicalModelId && familyAdapter
      ? familyAdapter.getCatalogModelProfile(canonicalModelId)
      : undefined;
  const canonicalGlmModel = canonicalModelId ? getStandardGlmModel(canonicalModelId) : undefined;

  const baseCaps = canonicalModel ?? getTransportGenericCaps(transport);
  const variantCaps = resolveCatalogVariantCaps({
    family,
    gateway,
    upstreamVendor,
    canonicalModelId,
  });
  const effectiveCaps = mergeCaps(mergeCaps(baseCaps, variantCaps), overrides.caps);
  const effectiveModalities = mergeModalities(
    canonicalModel?.modalities ?? getGenericOpenAiCompatibleModalities(),
    overrides.modalities,
  );

  const shouldUseNativePayloadPolicy =
    Boolean(canonicalGlmModel) && (gateway === "native-bigmodel" || gateway === "native-zai");
  const defaultPayloadPolicy: PayloadPatchPolicy = shouldUseNativePayloadPolicy
    ? "glm-native"
    : "safe-openai-compatible";
  const payloadPatchPolicy = overrides.payloadPatchPolicy ?? defaultPayloadPolicy;

  return {
    selectedModelId: input.modelId,
    canonicalModelId,
    evidence: {
      modelAlias: canonicalModelId ? "matched" : "none",
      platform: gateway,
      upstreamVendor,
      confidence: resolveConfidence(canonicalModelId, gateway),
    },
    payloadPatchPolicy,
    effectiveCaps,
    effectiveModalities,
    family,
    transport,
    gateway,
    patchPipeline: {
      zhipuNative: payloadPatchPolicy === "glm-native",
      dashscopeCompat: gateway === "gateway-dashscope" || detectedGateway === "gateway-dashscope",
    },
  };
}
