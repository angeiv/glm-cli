import type {
  CatalogModelProfile,
  EffectiveModelCaps,
  GlmPlatformRoute,
  GlmUpstreamVendor,
} from "../model-profile-types.js";

const QWEN_MODELS: CatalogModelProfile[] = [
  {
    id: "qwen/qwen3.6-plus",
    displayName: "Qwen 3.6 Plus",
    modalities: ["text", "image", "video"],
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    supportsThinking: true,
    defaultThinkingMode: "enabled",
    supportsPreservedThinking: false,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: false,
    supportsCache: false,
    supportsStructuredOutput: true,
    supportsMcp: false,
  },
  {
    id: "qwen/qwen3.6-flash",
    displayName: "Qwen 3.6 Flash",
    modalities: ["text", "image", "video"],
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    supportsThinking: true,
    defaultThinkingMode: "enabled",
    supportsPreservedThinking: false,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: false,
    supportsCache: false,
    supportsStructuredOutput: true,
    supportsMcp: false,
  },
  {
    id: "qwen/qwen3.6-max-preview",
    displayName: "Qwen 3.6 Max Preview",
    modalities: ["text"],
    contextWindow: 262_144,
    maxOutputTokens: 65_536,
    supportsThinking: true,
    defaultThinkingMode: "enabled",
    supportsPreservedThinking: false,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: false,
    supportsCache: false,
    supportsStructuredOutput: true,
    supportsMcp: false,
  },
  {
    id: "qwen/qwen3.6-35b-a3b",
    displayName: "Qwen 3.6 35B A3B",
    modalities: ["text", "image", "video"],
    contextWindow: 262_144,
    maxOutputTokens: 65_536,
    supportsThinking: true,
    defaultThinkingMode: "enabled",
    supportsPreservedThinking: false,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: false,
    supportsCache: false,
    supportsStructuredOutput: true,
    supportsMcp: false,
  },
  {
    id: "qwen/qwen3.6-27b",
    displayName: "Qwen 3.6 27B",
    modalities: ["text", "image", "video"],
    contextWindow: 256_000,
    maxOutputTokens: 65_536,
    supportsThinking: true,
    defaultThinkingMode: "enabled",
    supportsPreservedThinking: false,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: false,
    supportsCache: false,
    supportsStructuredOutput: true,
    supportsMcp: false,
  },
  {
    id: "qwen/qwen3.5-plus",
    displayName: "Qwen 3.5 Plus",
    modalities: ["text", "image", "video"],
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    supportsThinking: true,
    defaultThinkingMode: "enabled",
    supportsPreservedThinking: false,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: false,
    supportsCache: false,
    supportsStructuredOutput: true,
    supportsMcp: false,
  },
  {
    id: "qwen/qwen3.5-flash",
    displayName: "Qwen 3.5 Flash",
    modalities: ["text", "image", "video"],
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    supportsThinking: true,
    defaultThinkingMode: "enabled",
    supportsPreservedThinking: false,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: false,
    supportsCache: false,
    supportsStructuredOutput: true,
    supportsMcp: false,
  },
  {
    id: "qwen/qwen3.5-397b-a17b",
    displayName: "Qwen 3.5 397B A17B",
    modalities: ["text", "image", "video"],
    contextWindow: 262_144,
    maxOutputTokens: 65_536,
    supportsThinking: true,
    defaultThinkingMode: "enabled",
    supportsPreservedThinking: false,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: false,
    supportsCache: false,
    supportsStructuredOutput: true,
    supportsMcp: false,
  },
  {
    id: "qwen/qwen3.5-122b-a10b",
    displayName: "Qwen 3.5 122B A10B",
    modalities: ["text", "image", "video"],
    contextWindow: 262_144,
    maxOutputTokens: 65_536,
    supportsThinking: true,
    defaultThinkingMode: "enabled",
    supportsPreservedThinking: false,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: false,
    supportsCache: false,
    supportsStructuredOutput: true,
    supportsMcp: false,
  },
  {
    id: "qwen/qwen3.5-27b",
    displayName: "Qwen 3.5 27B",
    modalities: ["text", "image", "video"],
    contextWindow: 262_144,
    maxOutputTokens: 65_536,
    supportsThinking: true,
    defaultThinkingMode: "enabled",
    supportsPreservedThinking: false,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: false,
    supportsCache: false,
    supportsStructuredOutput: true,
    supportsMcp: false,
  },
  {
    id: "qwen/qwen3.5-35b-a3b",
    displayName: "Qwen 3.5 35B A3B",
    modalities: ["text", "image", "video"],
    contextWindow: 262_144,
    maxOutputTokens: 65_536,
    supportsThinking: true,
    defaultThinkingMode: "enabled",
    supportsPreservedThinking: false,
    supportsStreaming: true,
    supportsToolCall: true,
    supportsToolStream: false,
    supportsCache: false,
    supportsStructuredOutput: true,
    supportsMcp: false,
  },
];

const QWEN_MODEL_MAP: Map<string, CatalogModelProfile> = new Map(
  QWEN_MODELS.map((model) => [
    model.id,
    {
      ...model,
      modalities: [...model.modalities],
    } satisfies CatalogModelProfile,
  ]),
);

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

  const slashSegments = normalized.split("/").filter(Boolean);
  if (slashSegments.length > 0) {
    candidates.add(slashSegments[slashSegments.length - 1]);
  }

  return [...candidates];
}

function normalizeQwenNumericForms(candidate: string): string {
  let next = candidate;

  next = next.replace(/^qwen-(\d)\.(\d)(?=$|-)/, "qwen$1.$2");
  next = next.replace(/^qwen-(\d)-(\d)(?=$|-)/, "qwen$1.$2");
  next = next.replace(/^qwen(\d)-(\d)(?=$|-)/, "qwen$1.$2");
  next = next.replace(
    /^(qwen3\.(?:5|6)-(?:plus|flash))(?:-(?:\d{2}-\d{2}|\d{8}|\d{4}-\d{2}-\d{2}))$/,
    "$1",
  );

  return next;
}

export function getQwenCatalogModels(): CatalogModelProfile[] {
  return [...QWEN_MODEL_MAP.values()];
}

export function getQwenCatalogModelProfile(id: string): CatalogModelProfile | undefined {
  return QWEN_MODEL_MAP.get(id);
}

export function resolveCanonicalQwenModelId(modelId: string): string | undefined {
  for (const rawCandidate of extractCandidateSegments(modelId)) {
    const normalized = normalizeQwenNumericForms(rawCandidate);
    if (QWEN_MODEL_MAP.has(normalized)) {
      return normalized;
    }

    const prefixed = normalized.startsWith("qwen/") ? normalized : `qwen/${normalized}`;
    if (QWEN_MODEL_MAP.has(prefixed)) {
      return prefixed;
    }
  }

  return undefined;
}

export function resolveQwenVariantCaps(args: {
  gateway: GlmPlatformRoute;
  canonicalModelId?: string;
  upstreamVendor: GlmUpstreamVendor;
}): Partial<EffectiveModelCaps> {
  if (args.gateway === "gateway-openrouter" && args.canonicalModelId === "qwen/qwen3.6-35b-a3b") {
    return {
      supportsToolCall: false,
    };
  }

  return {};
}
