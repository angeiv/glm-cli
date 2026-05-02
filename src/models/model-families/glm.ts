import type {
  CatalogModelProfile,
  EffectiveModelCaps,
  GlmPlatformRoute,
  GlmUpstreamVendor,
  StandardGlmModel,
} from "../model-profile-types.js";

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

export function getStandardGlmModels(): StandardGlmModel[] {
  return [...STANDARD_GLM_MODEL_MAP.values()];
}

export function getStandardGlmModel(id: string): StandardGlmModel | undefined {
  return STANDARD_GLM_MODEL_MAP.get(id);
}

export function getGlmCatalogModelProfile(id: string): CatalogModelProfile | undefined {
  return STANDARD_GLM_MODEL_MAP.get(id);
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

export function resolveGlmVariantCaps(args: {
  gateway: GlmPlatformRoute;
  upstreamVendor: GlmUpstreamVendor;
  canonicalModelId?: string;
}): Partial<EffectiveModelCaps> {
  if (
    args.gateway === "gateway-openrouter" &&
    args.upstreamVendor === "z-ai" &&
    args.canonicalModelId === "glm-5.1"
  ) {
    return {
      contextWindow: 202_752,
    };
  }

  if (
    args.gateway === "gateway-openrouter" &&
    args.upstreamVendor === "fireworks" &&
    args.canonicalModelId === "glm-5"
  ) {
    return {
      contextWindow: 202_800,
      supportsToolCall: false,
      supportsToolStream: false,
    };
  }

  return {};
}
