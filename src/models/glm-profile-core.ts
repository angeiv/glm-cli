export type GlmThinkingMode = "auto" | "enabled" | "disabled";
export type GlmModelSource = "official" | "compat";
export type GlmModelTier = "flagship" | "base" | "turbo" | "flash" | "air" | "vision";
export type GlmModelFamily = "glm-5" | "glm-4.7" | "glm-4.6" | "glm-4.5" | "glm-4";
export type GlmInputModality = "text" | "image";

export type EffectiveModelCaps = {
  contextWindow: number;
  maxOutputTokens: number;
  supportsThinking: boolean;
  defaultThinkingMode: GlmThinkingMode;
  supportsPreservedThinking: boolean;
  supportsStreaming: boolean;
  supportsToolCall: boolean;
  supportsToolStream: boolean;
  supportsCache: boolean;
  supportsStructuredOutput: boolean;
  supportsMcp: boolean;
};

export type StandardGlmModel = EffectiveModelCaps & {
  id: string;
  displayName: string;
  family: GlmModelFamily;
  tier: GlmModelTier;
  modalities: GlmInputModality[];
  source: GlmModelSource;
};

export type CatalogModelProfile = EffectiveModelCaps & {
  id: string;
  displayName: string;
  modalities: GlmInputModality[];
};

export type GlmPlatformRoute =
  | "native-bigmodel"
  | "native-zai"
  | "gateway-openrouter"
  | "gateway-modelscope-openai"
  | "gateway-other"
  | "unknown";

export type GlmUpstreamVendor = "z-ai" | "fireworks" | "unknown";

export type VariantOverlay = {
  upstreamVendor: GlmUpstreamVendor;
  caps: Partial<EffectiveModelCaps>;
};

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
  effectiveModalities: GlmInputModality[];
};

export type ResolveGlmProfileInput = {
  modelId: string;
  baseUrl?: string;
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

const GENERIC_OPENAI_COMPATIBLE_MODALITIES: GlmInputModality[] = ["text", "image"];

const STANDARD_GLM_MODELS = [
  {
    id: "glm-5.1",
    displayName: "GLM 5.1",
    family: "glm-5",
    tier: "flagship",
    source: "official",
    contextWindow: 204_800,
    maxOutputTokens: 131_072,
    supportsThinking: true,
    defaultThinkingMode: "enabled",
    supportsPreservedThinking: true,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: true,
    supportsCache: true,
    supportsStructuredOutput: true,
    supportsMcp: true,
  },
  {
    id: "glm-5",
    displayName: "GLM 5",
    family: "glm-5",
    tier: "flagship",
    source: "official",
    contextWindow: 204_800,
    maxOutputTokens: 131_072,
    supportsThinking: true,
    defaultThinkingMode: "enabled",
    supportsPreservedThinking: true,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: true,
    supportsCache: true,
    supportsStructuredOutput: true,
    supportsMcp: true,
  },
  {
    id: "glm-5-turbo",
    displayName: "GLM 5 Turbo",
    family: "glm-5",
    tier: "turbo",
    source: "official",
    contextWindow: 204_800,
    maxOutputTokens: 131_072,
    supportsThinking: true,
    defaultThinkingMode: "enabled",
    supportsPreservedThinking: true,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: true,
    supportsCache: true,
    supportsStructuredOutput: true,
    supportsMcp: true,
  },
  {
    id: "glm-4.7",
    displayName: "GLM 4.7",
    family: "glm-4.7",
    tier: "flagship",
    source: "official",
    contextWindow: 204_800,
    maxOutputTokens: 131_072,
    supportsThinking: true,
    defaultThinkingMode: "enabled",
    supportsPreservedThinking: true,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: true,
    supportsCache: true,
    supportsStructuredOutput: true,
    supportsMcp: true,
  },
  {
    id: "glm-4.7-flash",
    displayName: "GLM 4.7 Flash",
    family: "glm-4.7",
    tier: "flash",
    source: "compat",
    contextWindow: 204_800,
    maxOutputTokens: 131_072,
    supportsThinking: true,
    defaultThinkingMode: "enabled",
    supportsPreservedThinking: true,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: true,
    supportsCache: true,
    supportsStructuredOutput: true,
    supportsMcp: true,
  },
  {
    id: "glm-4.7-flashx",
    displayName: "GLM 4.7 FlashX",
    family: "glm-4.7",
    tier: "flash",
    source: "official",
    contextWindow: 204_800,
    maxOutputTokens: 131_072,
    supportsThinking: true,
    defaultThinkingMode: "enabled",
    supportsPreservedThinking: true,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: true,
    supportsCache: true,
    supportsStructuredOutput: true,
    supportsMcp: true,
  },
  {
    id: "glm-4.6",
    displayName: "GLM 4.6",
    family: "glm-4.6",
    tier: "flagship",
    source: "official",
    contextWindow: 204_800,
    maxOutputTokens: 131_072,
    supportsThinking: true,
    defaultThinkingMode: "auto",
    supportsPreservedThinking: false,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: true,
    supportsCache: true,
    supportsStructuredOutput: true,
    supportsMcp: true,
  },
  {
    id: "glm-4.5-air",
    displayName: "GLM 4.5 Air",
    family: "glm-4.5",
    tier: "air",
    source: "official",
    contextWindow: 131_072,
    maxOutputTokens: 98_304,
    supportsThinking: true,
    defaultThinkingMode: "auto",
    supportsPreservedThinking: false,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: false,
    supportsCache: true,
    supportsStructuredOutput: true,
    supportsMcp: false,
  },
  {
    id: "glm-4.5-airx",
    displayName: "GLM 4.5 AirX",
    family: "glm-4.5",
    tier: "air",
    source: "compat",
    contextWindow: 131_072,
    maxOutputTokens: 98_304,
    supportsThinking: true,
    defaultThinkingMode: "auto",
    supportsPreservedThinking: false,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: false,
    supportsCache: true,
    supportsStructuredOutput: true,
    supportsMcp: false,
  },
  {
    id: "glm-4.5-flash",
    displayName: "GLM 4.5 Flash",
    family: "glm-4.5",
    tier: "flash",
    source: "compat",
    contextWindow: 131_072,
    maxOutputTokens: 98_304,
    supportsThinking: true,
    defaultThinkingMode: "auto",
    supportsPreservedThinking: false,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: false,
    supportsCache: true,
    supportsStructuredOutput: true,
    supportsMcp: false,
  },
  {
    id: "glm-4-flash-250414",
    displayName: "GLM 4 Flash 250414",
    family: "glm-4",
    tier: "flash",
    source: "compat",
    contextWindow: 131_072,
    maxOutputTokens: 16_384,
    supportsThinking: true,
    defaultThinkingMode: "auto",
    supportsPreservedThinking: false,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: false,
    supportsCache: false,
    supportsStructuredOutput: true,
    supportsMcp: false,
  },
  {
    id: "glm-4-flashx-250414",
    displayName: "GLM 4 FlashX 250414",
    family: "glm-4",
    tier: "flash",
    source: "compat",
    contextWindow: 131_072,
    maxOutputTokens: 16_384,
    supportsThinking: true,
    defaultThinkingMode: "auto",
    supportsPreservedThinking: false,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: false,
    supportsCache: false,
    supportsStructuredOutput: true,
    supportsMcp: false,
  },
] as const satisfies ReadonlyArray<Omit<StandardGlmModel, "modalities">>;

const STANDARD_GLM_MODEL_MAP: Map<string, StandardGlmModel> = new Map(
  STANDARD_GLM_MODELS.map((model) => [
    model.id,
    {
      ...model,
      modalities: ["text"],
    } satisfies StandardGlmModel,
  ]),
);

const BUILTIN_COMPAT_MODELS: CatalogModelProfile[] = [
  {
    id: "qwen/qwen3.5-122b-a10b",
    displayName: "Qwen 3.5 122B A10B",
    modalities: ["text", "image"],
    contextWindow: 262_144,
    maxOutputTokens: 81_920,
    supportsThinking: true,
    defaultThinkingMode: "enabled",
    supportsPreservedThinking: false,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: false,
    supportsCache: false,
    supportsStructuredOutput: false,
    supportsMcp: false,
  },
];

const BUILTIN_COMPAT_MODEL_MAP: Map<string, CatalogModelProfile> = new Map(
  BUILTIN_COMPAT_MODELS.map((model) => [
    model.id,
    {
      ...model,
      modalities: [...model.modalities],
    } satisfies CatalogModelProfile,
  ]),
);

const EXPLICIT_ALIAS_MAP = new Map<string, string>([
  ["glm5", "glm-5"],
  ["glm51", "glm-5.1"],
  ["glm5.1", "glm-5.1"],
  ["glm5-1", "glm-5.1"],
  ["glm5p1", "glm-5.1"],
  ["glm-5-1", "glm-5.1"],
  ["glm-5p1", "glm-5.1"],
  ["zhipuai/glm-5", "glm-5"],
  ["zhipuai/glm-5-1", "glm-5.1"],
  ["z-ai/glm-5", "glm-5"],
  ["z-ai/glm-5-1", "glm-5.1"],
  ["z-ai/glm-5.1", "glm-5.1"],
]);

const BUILTIN_COMPAT_ALIAS_MAP = new Map<string, string>([
  ["qwen/qwen3.5-122b-a10b", "qwen/qwen3.5-122b-a10b"],
  ["qwen3.5-122b-a10b", "qwen/qwen3.5-122b-a10b"],
  ["qwen3-5-122b-a10b", "qwen/qwen3.5-122b-a10b"],
]);

function normalizeModelId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/:+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/-+/g, "-");
}

function extractCandidateSegments(value: string): string[] {
  const normalized = normalizeModelId(value);
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

function normalizeGlmNumericForms(candidate: string): string {
  let next = candidate;

  next = next.replace(/^glm(?=\d)/, "glm-");
  next = next.replace(/^glm-(\d)p(\d)(?=$|-)/, "glm-$1.$2");
  next = next.replace(/^glm-(\d)-(\d)(?=$|-)/, "glm-$1.$2");
  next = next.replace(/^glm(\d)\.(\d)(?=$|-)/, "glm-$1.$2");
  next = next.replace(/^glm(\d)(\d)(?=$|-)/, "glm-$1.$2");

  return next;
}

function normalizeBuiltinCompatNumericForms(candidate: string): string {
  let next = candidate;

  next = next.replace(/^qwen-(\d)\.(\d)(?=$|-)/, "qwen$1.$2");
  next = next.replace(/^qwen-(\d)-(\d)(?=$|-)/, "qwen$1.$2");
  next = next.replace(/^qwen(\d)-(\d)(?=$|-)/, "qwen$1.$2");

  return next;
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
  if (canonicalModelId && (platform === "native-bigmodel" || platform === "native-zai")) {
    return "high";
  }

  if (canonicalModelId) {
    return "medium";
  }

  return "low";
}

export function getStandardGlmModels(): StandardGlmModel[] {
  return [...STANDARD_GLM_MODEL_MAP.values()];
}

export function getStandardGlmModel(id: string): StandardGlmModel | undefined {
  return STANDARD_GLM_MODEL_MAP.get(id);
}

export function getCatalogModelProfile(id: string): CatalogModelProfile | undefined {
  return STANDARD_GLM_MODEL_MAP.get(id) ?? BUILTIN_COMPAT_MODEL_MAP.get(id);
}

export function getGenericOpenAiCompatibleCaps(): EffectiveModelCaps {
  return { ...GENERIC_OPENAI_COMPATIBLE_CAPS };
}

export function getGenericOpenAiCompatibleModalities(): GlmInputModality[] {
  return [...GENERIC_OPENAI_COMPATIBLE_MODALITIES];
}

export function resolveCanonicalGlmModelId(modelId: string): string | undefined {
  for (const rawCandidate of extractCandidateSegments(modelId)) {
    const explicit = EXPLICIT_ALIAS_MAP.get(rawCandidate);
    if (explicit) {
      return explicit;
    }

    const normalized = normalizeGlmNumericForms(rawCandidate);
    if (STANDARD_GLM_MODEL_MAP.has(normalized)) {
      return normalized;
    }
  }

  return undefined;
}

function resolveCanonicalBuiltinCompatModelId(modelId: string): string | undefined {
  for (const rawCandidate of extractCandidateSegments(modelId)) {
    const explicit = BUILTIN_COMPAT_ALIAS_MAP.get(rawCandidate);
    if (explicit) {
      return explicit;
    }

    const normalized = normalizeBuiltinCompatNumericForms(rawCandidate);
    const normalizedExplicit = BUILTIN_COMPAT_ALIAS_MAP.get(normalized);
    if (normalizedExplicit) {
      return normalizedExplicit;
    }

    if (BUILTIN_COMPAT_MODEL_MAP.has(normalized)) {
      return normalized;
    }
  }

  return undefined;
}

export function resolveCanonicalCatalogModelId(modelId: string): string | undefined {
  return resolveCanonicalGlmModelId(modelId) ?? resolveCanonicalBuiltinCompatModelId(modelId);
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

export function resolveVariantOverlay(
  platform: GlmPlatformRoute,
  modelId: string,
  canonicalModelId?: string,
): VariantOverlay {
  const upstreamVendor = resolveGlmUpstreamVendor(platform, modelId);

  if (
    platform === "gateway-openrouter" &&
    upstreamVendor === "z-ai" &&
    canonicalModelId === "glm-5.1"
  ) {
    return {
      upstreamVendor,
      caps: {
        contextWindow: 202_752,
      },
    };
  }

  if (
    platform === "gateway-openrouter" &&
    upstreamVendor === "fireworks" &&
    canonicalModelId === "glm-5"
  ) {
    return {
      upstreamVendor,
      caps: {
        contextWindow: 202_800,
        supportsToolCall: false,
        supportsToolStream: false,
      },
    };
  }

  return {
    upstreamVendor,
    caps: {},
  };
}

export function resolveGlmProfile(input: ResolveGlmProfileInput): ResolvedGlmProfile {
  const platform = resolveGlmPlatformRoute(input.baseUrl);
  const canonicalModelId = resolveCanonicalCatalogModelId(input.modelId);
  const canonicalModel = canonicalModelId ? getCatalogModelProfile(canonicalModelId) : undefined;
  const canonicalGlmModel = canonicalModelId ? getStandardGlmModel(canonicalModelId) : undefined;

  const baseCaps = canonicalModel ?? getGenericOpenAiCompatibleCaps();
  const variant = resolveVariantOverlay(platform, input.modelId, canonicalModelId);
  const effectiveCaps = mergeCaps(baseCaps, variant.caps);
  const effectiveModalities = canonicalModel?.modalities ?? getGenericOpenAiCompatibleModalities();

  const payloadPatchPolicy: PayloadPatchPolicy =
    canonicalGlmModel && (platform === "native-bigmodel" || platform === "native-zai")
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
    effectiveModalities,
  };
}
