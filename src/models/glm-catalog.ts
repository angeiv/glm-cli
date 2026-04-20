export type GlmThinkingMode = "auto" | "enabled" | "disabled";
export type GlmModelSource = "official" | "compat";
export type GlmModelTier =
  | "flagship"
  | "base"
  | "turbo"
  | "flash"
  | "air"
  | "vision";
export type GlmModelFamily =
  | "glm-5"
  | "glm-4.7"
  | "glm-4.6"
  | "glm-4.5"
  | "glm-4";

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
  modalities: string[];
  source: GlmModelSource;
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
    supportsToolStream: false,
    supportsCache: true,
    supportsStructuredOutput: true,
    supportsMcp: false,
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

export function getStandardGlmModels(): StandardGlmModel[] {
  return [...STANDARD_GLM_MODEL_MAP.values()];
}

export function getStandardGlmModel(id: string): StandardGlmModel | undefined {
  return STANDARD_GLM_MODEL_MAP.get(id);
}

export function getGenericOpenAiCompatibleCaps(): EffectiveModelCaps {
  return { ...GENERIC_OPENAI_COMPATIBLE_CAPS };
}
