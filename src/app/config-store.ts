import { getGlmConfigPath, getGlmRootDir } from "./dirs.js";
import * as fsPromises from "node:fs/promises";

export const fileSystem = {
  readFile: fsPromises.readFile,
  mkdir: fsPromises.mkdir,
  writeFile: fsPromises.writeFile,
};

export type ProviderConfig = {
  apiKey: string;
  baseURL: string;
  /**
   * Optional shorthand for selecting one of GLM's official endpoints without
   * having to specify the full baseURL. This is currently only used for the
   * `glm` provider by our bundled Pi extension.
   */
  endpoint?: string;
};

export type StorageProviderKey = "glm" | "openai-compatible";
export type ApprovalPolicy = "ask" | "auto" | "never";
export type ThinkingMode = "auto" | "enabled" | "disabled";
export type ToolStreamMode = "auto" | "on" | "off";
export type ResponseFormatType = "json_object";
export type GenerationConfig = {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
};
export type GlmCapabilitiesConfig = {
  thinkingMode?: ThinkingMode;
  clearThinking?: boolean;
  toolStream?: ToolStreamMode;
  responseFormat?: ResponseFormatType;
};

type PersistedProviderName = StorageProviderKey;
const PERSISTED_PROVIDER_NAMES: PersistedProviderName[] = ["glm", "openai-compatible"];

const VALID_APPROVAL_POLICIES: ApprovalPolicy[] = ["ask", "auto", "never"];
const VALID_THINKING_MODES: ThinkingMode[] = ["auto", "enabled", "disabled"];
const VALID_TOOL_STREAM_MODES: ToolStreamMode[] = ["auto", "on", "off"];
const VALID_RESPONSE_FORMAT_TYPES: ResponseFormatType[] = ["json_object"];

const BASE_DEFAULT_CONFIG_FILE = buildDefaultConfigFile();

function createEmptyProviderConfig(): ProviderConfig {
  return { apiKey: "", baseURL: "" };
}

function createDefaultGenerationConfig(): GenerationConfig {
  return {};
}

function createDefaultGlmCapabilitiesConfig(): GlmCapabilitiesConfig {
  return {
    thinkingMode: "auto",
    toolStream: "auto",
  };
}

function buildDefaultConfigFile(): GlmConfigFile {
  return {
    defaultProvider: "glm",
    defaultModel: "glm-5.1",
    approvalPolicy: "ask",
    generation: createDefaultGenerationConfig(),
    glmCapabilities: createDefaultGlmCapabilitiesConfig(),
    providers: {
      glm: createEmptyProviderConfig(),
      "openai-compatible": createEmptyProviderConfig(),
    },
  };
}

export type GlmConfigFile = {
  defaultProvider?: PersistedProviderName;
  defaultModel?: string;
  approvalPolicy?: ApprovalPolicy;
  generation: GenerationConfig;
  glmCapabilities: GlmCapabilitiesConfig;
  providers: Record<StorageProviderKey, ProviderConfig>;
};

function cloneProviderConfig(config?: ProviderConfig): ProviderConfig {
  const base: ProviderConfig = {
    apiKey: config?.apiKey ?? "",
    baseURL: config?.baseURL ?? "",
  };

  const endpointRaw = (config as unknown as { endpoint?: unknown })?.endpoint;
  if (endpointRaw === undefined) {
    return base;
  }

  // Preserve invalid endpoint values so validation can reject them.
  if (typeof endpointRaw !== "string") {
    return { ...(base as any), endpoint: endpointRaw } as ProviderConfig;
  }

  const endpoint = endpointRaw.trim();

  // Keep config JSON tidy by omitting empty endpoint keys.
  if (!endpoint) return base;

  return { ...base, endpoint };
}

function cloneGenerationConfig(config?: GenerationConfig): GenerationConfig {
  const maxOutputTokens =
    typeof config?.maxOutputTokens === "number" ? config.maxOutputTokens : undefined;
  const temperature =
    typeof config?.temperature === "number" ? config.temperature : undefined;
  const topP = typeof config?.topP === "number" ? config.topP : undefined;

  return {
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    ...(temperature === undefined ? {} : { temperature }),
    ...(topP === undefined ? {} : { topP }),
  };
}

function cloneGlmCapabilitiesConfig(config?: GlmCapabilitiesConfig): GlmCapabilitiesConfig {
  const rawThinkingMode = (config as unknown as { thinkingMode?: unknown })?.thinkingMode;
  const rawClearThinking = (config as unknown as { clearThinking?: unknown })?.clearThinking;
  const rawToolStream = (config as unknown as { toolStream?: unknown })?.toolStream;
  const rawResponseFormat = (config as unknown as { responseFormat?: unknown })?.responseFormat;

  return {
    thinkingMode:
      rawThinkingMode === undefined
        ? BASE_DEFAULT_CONFIG_FILE.glmCapabilities.thinkingMode
        : (rawThinkingMode as ThinkingMode),
    ...(rawClearThinking === undefined
      ? {}
      : { clearThinking: rawClearThinking as boolean }),
    toolStream:
      rawToolStream === undefined
        ? BASE_DEFAULT_CONFIG_FILE.glmCapabilities.toolStream
        : (rawToolStream as ToolStreamMode),
    ...(rawResponseFormat === undefined
      ? {}
      : { responseFormat: rawResponseFormat as ResponseFormatType }),
  };
}

export function normalizeConfigFile(config?: Partial<GlmConfigFile>): GlmConfigFile {
  const rawDefaultProvider = (config as unknown as { defaultProvider?: unknown })?.defaultProvider;
  const defaultProvider =
    rawDefaultProvider === undefined
      ? BASE_DEFAULT_CONFIG_FILE.defaultProvider
      : (rawDefaultProvider as PersistedProviderName);

  return {
    defaultProvider,
    defaultModel: config?.defaultModel ?? BASE_DEFAULT_CONFIG_FILE.defaultModel,
    approvalPolicy: config?.approvalPolicy ?? BASE_DEFAULT_CONFIG_FILE.approvalPolicy,
    generation: cloneGenerationConfig(
      (config as unknown as { generation?: GenerationConfig })?.generation ??
        BASE_DEFAULT_CONFIG_FILE.generation,
    ),
    glmCapabilities: cloneGlmCapabilitiesConfig(
      (config as unknown as { glmCapabilities?: GlmCapabilitiesConfig })?.glmCapabilities ??
        BASE_DEFAULT_CONFIG_FILE.glmCapabilities,
    ),
    providers: {
      glm: cloneProviderConfig(
        config?.providers?.glm ?? BASE_DEFAULT_CONFIG_FILE.providers.glm,
      ),
      "openai-compatible": cloneProviderConfig(
        config?.providers?.["openai-compatible"] ?? BASE_DEFAULT_CONFIG_FILE.providers["openai-compatible"],
      ),
    },
  };
}

export function getDefaultConfigFile(): GlmConfigFile {
  return normalizeConfigFile();
}

function isPersistedProviderName(value?: string): value is PersistedProviderName {
  return PERSISTED_PROVIDER_NAMES.includes(value as PersistedProviderName);
}

function isApprovalPolicy(value?: string): value is ApprovalPolicy {
  return VALID_APPROVAL_POLICIES.includes(value as ApprovalPolicy);
}

function isThinkingMode(value?: string): value is ThinkingMode {
  return VALID_THINKING_MODES.includes(value as ThinkingMode);
}

function isToolStreamMode(value?: string): value is ToolStreamMode {
  return VALID_TOOL_STREAM_MODES.includes(value as ToolStreamMode);
}

function isResponseFormatType(value?: string): value is ResponseFormatType {
  return VALID_RESPONSE_FORMAT_TYPES.includes(value as ResponseFormatType);
}

function validateConfigFile(config: GlmConfigFile): void {
  if (!isPersistedProviderName(config.defaultProvider)) {
    throw new Error(`Invalid default provider in config file: ${config.defaultProvider}`);
  }

  if (typeof config.defaultModel !== "string") {
    throw new Error(`Invalid defaultModel in config file: ${typeof config.defaultModel}`);
  }

  if (!isApprovalPolicy(config.approvalPolicy)) {
    throw new Error(`Invalid approval policy in config file: ${config.approvalPolicy}`);
  }

  validateGenerationConfig(config.generation);
  validateGlmCapabilitiesConfig(config.glmCapabilities);

  Object.entries(config.providers).forEach(([key, value]) => {
    validateProviderConfig(value, key as StorageProviderKey);
  });
}

function validateGenerationConfig(config: GenerationConfig): void {
  if (
    config.maxOutputTokens !== undefined &&
    (!Number.isInteger(config.maxOutputTokens) || config.maxOutputTokens <= 0)
  ) {
    throw new Error(`Invalid maxOutputTokens in config file: ${config.maxOutputTokens}`);
  }

  if (
    config.temperature !== undefined &&
    (!Number.isFinite(config.temperature) || config.temperature < 0)
  ) {
    throw new Error(`Invalid temperature in config file: ${config.temperature}`);
  }

  if (
    config.topP !== undefined &&
    (!Number.isFinite(config.topP) || config.topP <= 0 || config.topP > 1)
  ) {
    throw new Error(`Invalid topP in config file: ${config.topP}`);
  }
}

function validateGlmCapabilitiesConfig(config: GlmCapabilitiesConfig): void {
  if (!isThinkingMode(config.thinkingMode)) {
    throw new Error(`Invalid thinkingMode in config file: ${config.thinkingMode}`);
  }

  if (config.clearThinking !== undefined && typeof config.clearThinking !== "boolean") {
    throw new Error(`Invalid clearThinking in config file: ${typeof config.clearThinking}`);
  }

  if (!isToolStreamMode(config.toolStream)) {
    throw new Error(`Invalid toolStream in config file: ${config.toolStream}`);
  }

  if (
    config.responseFormat !== undefined &&
    !isResponseFormatType(config.responseFormat)
  ) {
    throw new Error(`Invalid responseFormat in config file: ${config.responseFormat}`);
  }
}

function validateProviderConfig(config: ProviderConfig, key: StorageProviderKey): void {
  if (typeof config.apiKey !== "string") {
    throw new Error(`Invalid apiKey for provider ${key}: ${typeof config.apiKey}`);
  }
  if (typeof config.baseURL !== "string") {
    throw new Error(`Invalid baseURL for provider ${key}: ${typeof config.baseURL}`);
  }

  const endpoint = (config as unknown as { endpoint?: unknown })?.endpoint;
  if (endpoint !== undefined && typeof endpoint !== "string") {
    throw new Error(`Invalid endpoint for provider ${key}: ${typeof endpoint}`);
  }
}

export async function readConfigFile(): Promise<GlmConfigFile> {
  try {
    const contents = await fileSystem.readFile(getGlmConfigPath(), "utf8");
    const parsed = JSON.parse(contents) as Partial<GlmConfigFile>;
    const normalized = normalizeConfigFile(parsed);
    validateConfigFile(normalized);
    return normalized;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return getDefaultConfigFile();
    }
    throw err;
  }
}

export async function writeConfigFile(config: GlmConfigFile): Promise<void> {
  await fileSystem.mkdir(getGlmRootDir(), { recursive: true });
  await fileSystem.writeFile(
    getGlmConfigPath(),
    JSON.stringify(normalizeConfigFile(config), null, 2),
    "utf8",
  );
}
