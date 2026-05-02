export type GlmThinkingMode = "auto" | "enabled" | "disabled";
export type GlmModelSource = "official" | "compat";
export type GlmModelTier = "flagship" | "base" | "turbo" | "flash" | "air" | "vision";
export type GlmModelFamily = "glm-5" | "glm-4.7" | "glm-4.6" | "glm-4.5" | "glm-4";
export type GlmInputModality = "text" | "image" | "video";
export type RuntimeModelFamily = "glm" | "qwen" | "generic";
export type RuntimeTransport = "openai-completions" | "openai-responses" | "anthropic-messages";

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
  | "gateway-dashscope"
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

export type RuntimePatchPipeline = {
  zhipuNative: boolean;
  dashscopeCompat: boolean;
};

export type ResolvedRuntimeModelProfile = ResolvedGlmProfile & {
  family: RuntimeModelFamily;
  transport: RuntimeTransport;
  gateway: GlmPlatformRoute;
  patchPipeline: RuntimePatchPipeline;
};
