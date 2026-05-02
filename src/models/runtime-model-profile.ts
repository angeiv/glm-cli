import type {
  EffectiveModelCaps,
  GlmInputModality,
  GlmPlatformRoute,
  GlmUpstreamVendor,
  PayloadPatchPolicy,
  ResolvedRuntimeModelProfile,
  ResolveGlmProfileInput,
  ResolutionConfidence,
  RuntimeTransport,
} from "./model-profile-types.js";
import {
  getCatalogModelFamily,
  getGenericAnthropicCompatibleCaps,
  getCatalogModelProfile,
  getGenericOpenAiCompatibleCaps,
  getGenericOpenAiCompatibleModalities,
  getStandardGlmModel,
  resolveCanonicalCatalogModelId,
  resolveCatalogVariantCaps,
} from "./model-family-registry.js";

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
  modalities?: GlmInputModality[];
  caps?: Partial<EffectiveModelCaps>;
};

export type ResolveRuntimeModelProfileInput = ResolveGlmProfileInput & {
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
  platform: GlmPlatformRoute,
): ResolutionConfidence {
  if (canonicalModelId && (platform === "native-bigmodel" || platform === "native-zai")) {
    return "high";
  }

  if (canonicalModelId) {
    return "medium";
  }

  return "low";
}

export function resolveProviderTransport(provider?: string): RuntimeTransport {
  if (provider === "openai-responses") {
    return "openai-responses";
  }

  if (provider === "anthropic") {
    return "anthropic-messages";
  }

  return "openai-completions";
}

export function resolveGlmPlatformRoute(baseUrl?: string): GlmPlatformRoute {
  if (!baseUrl?.trim()) {
    return "unknown";
  }

  let host: string | undefined;
  try {
    host = new URL(baseUrl).hostname.trim().toLowerCase();
  } catch {
    return "unknown";
  }

  if (host === "open.bigmodel.cn" || host.endsWith(".bigmodel.cn")) {
    return "native-bigmodel";
  }

  if (host === "api.z.ai" || host.endsWith(".z.ai")) {
    return "native-zai";
  }

  if (host === "openrouter.ai" || host.endsWith(".openrouter.ai")) {
    return "gateway-openrouter";
  }

  if (host === "api-inference.modelscope.cn") {
    return "gateway-modelscope-openai";
  }

  if (host === "dashscope.aliyuncs.com" || host === "bailian.aliyuncs.com") {
    return "gateway-dashscope";
  }

  return "gateway-other";
}

export function resolveGlmUpstreamVendor(
  platform: GlmPlatformRoute,
  modelId: string,
): GlmUpstreamVendor {
  if (platform !== "gateway-openrouter") {
    return "unknown";
  }

  const normalized = modelId.trim().toLowerCase();
  if (
    normalized.startsWith("z-ai/") ||
    normalized.startsWith("zai/") ||
    normalized.startsWith("zai-org/")
  ) {
    return "z-ai";
  }

  if (normalized.includes("fireworks")) {
    return "fireworks";
  }

  return "unknown";
}

export function resolveRuntimeModelProfile(
  input: ResolveRuntimeModelProfileInput,
): ResolvedRuntimeModelProfile {
  const gateway = resolveGlmPlatformRoute(input.baseUrl);
  const transport = resolveProviderTransport(input.provider);
  const upstreamVendor = resolveGlmUpstreamVendor(gateway, input.modelId);
  const baseCanonical = resolveCanonicalCatalogModelId(input.modelId);

  const baseContext: GlmResolutionContext = {
    provider: input.provider ? normalize(input.provider) : undefined,
    baseUrl: input.baseUrl,
    modelId: input.modelId,
    platform: gateway,
    upstreamVendor,
    canonicalModelId: baseCanonical,
  };

  const overrides = applyOverrides(baseContext, input.overrides);
  const canonicalModelId = overrides.canonicalModelId ?? baseCanonical;
  const canonicalModel = canonicalModelId ? getCatalogModelProfile(canonicalModelId) : undefined;
  const canonicalGlmModel = canonicalModelId ? getStandardGlmModel(canonicalModelId) : undefined;
  const family = getCatalogModelFamily(canonicalModelId);

  const baseCaps =
    canonicalModel ??
    (transport === "anthropic-messages"
      ? getGenericAnthropicCompatibleCaps()
      : getGenericOpenAiCompatibleCaps());
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

  const defaultPayloadPolicy: PayloadPatchPolicy =
    canonicalGlmModel && (gateway === "native-bigmodel" || gateway === "native-zai")
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
      dashscopeCompat: gateway === "gateway-dashscope",
    },
  };
}
