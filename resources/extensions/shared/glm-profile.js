const GENERIC_OPENAI_COMPATIBLE_CAPS = {
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
    modalities: ["text"],
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
    modalities: ["text"],
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
    modalities: ["text"],
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
    modalities: ["text"],
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
    modalities: ["text"],
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
    modalities: ["text"],
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
    supportsToolStream: false,
    supportsCache: true,
    supportsStructuredOutput: true,
    supportsMcp: false,
    modalities: ["text"],
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
    modalities: ["text"],
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
    modalities: ["text"],
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
    modalities: ["text"],
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
    modalities: ["text"],
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
    modalities: ["text"],
  },
];

const STANDARD_GLM_MODEL_MAP = new Map(STANDARD_GLM_MODELS.map((model) => [model.id, model]));

const EXPLICIT_ALIAS_MAP = new Map([
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

function normalizeModelId(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/:+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/-+/g, "-");
}

function extractCandidateSegments(value) {
  const normalized = normalizeModelId(value);
  const candidates = new Set();
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

function normalizeGlmNumericForms(candidate) {
  let next = candidate;
  next = next.replace(/^glm(?=\d)/, "glm-");
  next = next.replace(/^glm-(\d)p(\d)(?=$|-)/, "glm-$1.$2");
  next = next.replace(/^glm-(\d)-(\d)(?=$|-)/, "glm-$1.$2");
  next = next.replace(/^glm(\d)\.(\d)(?=$|-)/, "glm-$1.$2");
  next = next.replace(/^glm(\d)(\d)(?=$|-)/, "glm-$1.$2");
  return next;
}

function resolveCanonicalGlmModelId(modelId) {
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
  return void 0;
}

function resolveGlmPlatformRoute(baseUrl) {
  if (!baseUrl?.trim()) {
    return "unknown";
  }
  let host;
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

function resolveGlmUpstreamVendor(platform, modelId) {
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

function resolveVariantOverlay(platform, modelId, canonicalModelId) {
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

function mergeCaps(base, overlay = {}) {
  return { ...base, ...overlay };
}

function resolveConfidence(canonicalModelId, platform) {
  if (canonicalModelId && (platform === "native-bigmodel" || platform === "native-zai")) {
    return "high";
  }
  if (canonicalModelId) {
    return "medium";
  }
  return "low";
}

function resolveGlmProfile({ modelId, baseUrl }) {
  const platform = resolveGlmPlatformRoute(baseUrl);
  const canonicalModelId = resolveCanonicalGlmModelId(modelId);
  const canonicalModel = canonicalModelId
    ? STANDARD_GLM_MODEL_MAP.get(canonicalModelId)
    : void 0;
  const baseCaps = canonicalModel ?? GENERIC_OPENAI_COMPATIBLE_CAPS;
  const variant = resolveVariantOverlay(platform, modelId, canonicalModelId);
  return {
    selectedModelId: modelId,
    canonicalModelId,
    evidence: {
      modelAlias: canonicalModelId ? "matched" : "none",
      platform,
      upstreamVendor: variant.upstreamVendor,
      confidence: resolveConfidence(canonicalModelId, platform),
    },
    payloadPatchPolicy:
      canonicalModelId && (platform === "native-bigmodel" || platform === "native-zai")
        ? "glm-native"
        : "safe-openai-compatible",
    effectiveCaps: mergeCaps(baseCaps, variant.caps),
  };
}

function getStandardGlmModel(id) {
  return STANDARD_GLM_MODEL_MAP.get(id);
}

function getStandardGlmModels() {
  return [...STANDARD_GLM_MODEL_MAP.values()];
}

function getGenericOpenAiCompatibleCaps() {
  return { ...GENERIC_OPENAI_COMPATIBLE_CAPS };
}

export {
  getGenericOpenAiCompatibleCaps,
  getStandardGlmModel,
  getStandardGlmModels,
  resolveCanonicalGlmModelId,
  resolveGlmPlatformRoute,
  resolveGlmProfile,
};
