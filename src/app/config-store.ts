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
export type LoopProfileName = "code";
export type LoopFailureMode = "handoff" | "fail";
export type DiagnosticsConfig = {
  debugRuntime?: boolean;
  eventLogLimit?: number;
};
export type HooksConfig = {
  hooksEnabled?: boolean;
  hookTimeoutMs?: number;
};
export type NotificationsConfig = {
  enabled?: boolean;
  onTurnEnd?: boolean;
  onLoopResult?: boolean;
};
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
export type LoopConfig = {
  enabledByDefault?: boolean;
  profile?: LoopProfileName;
  maxRounds?: number;
  /**
   * Optional safety cap for tool calls executed while a loop is active.
   * Note: enforced at the product layer, not by the provider.
   */
  maxToolCalls?: number;
  /**
   * Optional safety cap for verification runs executed while a loop is active.
   * Note: enforced at the product layer, not by the provider.
   */
  maxVerifyRuns?: number;
  failureMode?: LoopFailureMode;
  autoVerify?: boolean;
  verifyCommand?: string;
};

type PersistedProviderName = StorageProviderKey | "openai-responses";
const PERSISTED_PROVIDER_NAMES: PersistedProviderName[] = ["glm", "openai-compatible", "openai-responses"];

const VALID_APPROVAL_POLICIES: ApprovalPolicy[] = ["ask", "auto", "never"];
const VALID_THINKING_MODES: ThinkingMode[] = ["auto", "enabled", "disabled"];
const VALID_TOOL_STREAM_MODES: ToolStreamMode[] = ["auto", "on", "off"];
const VALID_RESPONSE_FORMAT_TYPES: ResponseFormatType[] = ["json_object"];
const VALID_LOOP_PROFILES: LoopProfileName[] = ["code"];
const VALID_LOOP_FAILURE_MODES: LoopFailureMode[] = ["handoff", "fail"];

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

function createDefaultNotificationsConfig(): NotificationsConfig {
  return {
    enabled: false,
    onTurnEnd: true,
    onLoopResult: true,
  };
}

function createDefaultLoopConfig(): LoopConfig {
  return {
    enabledByDefault: false,
    profile: "code",
    maxRounds: 3,
    failureMode: "handoff",
    autoVerify: true,
  };
}

function buildDefaultConfigFile(): GlmConfigFile {
  return {
    defaultProvider: "glm",
    defaultModel: "glm-5.1",
    approvalPolicy: "ask",
    debugRuntime: false,
    eventLogLimit: 200,
    hooksEnabled: true,
    hookTimeoutMs: 5000,
    notifications: createDefaultNotificationsConfig(),
    generation: createDefaultGenerationConfig(),
    glmCapabilities: createDefaultGlmCapabilitiesConfig(),
    loop: createDefaultLoopConfig(),
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
  debugRuntime?: boolean;
  eventLogLimit?: number;
  hooksEnabled?: boolean;
  hookTimeoutMs?: number;
  notifications: NotificationsConfig;
  generation: GenerationConfig;
  glmCapabilities: GlmCapabilitiesConfig;
  loop: LoopConfig;
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

function cloneNotificationsConfig(config?: NotificationsConfig): NotificationsConfig {
  const rawEnabled = (config as unknown as { enabled?: unknown })?.enabled;
  const rawOnTurnEnd = (config as unknown as { onTurnEnd?: unknown })?.onTurnEnd;
  const rawOnLoopResult = (config as unknown as { onLoopResult?: unknown })?.onLoopResult;

  return {
    enabled:
      rawEnabled === undefined
        ? BASE_DEFAULT_CONFIG_FILE.notifications.enabled
        : (rawEnabled as boolean),
    onTurnEnd:
      rawOnTurnEnd === undefined
        ? BASE_DEFAULT_CONFIG_FILE.notifications.onTurnEnd
        : (rawOnTurnEnd as boolean),
    onLoopResult:
      rawOnLoopResult === undefined
        ? BASE_DEFAULT_CONFIG_FILE.notifications.onLoopResult
        : (rawOnLoopResult as boolean),
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

function cloneLoopConfig(config?: LoopConfig): LoopConfig {
  const rawEnabledByDefault =
    (config as unknown as { enabledByDefault?: unknown })?.enabledByDefault;
  const rawProfile = (config as unknown as { profile?: unknown })?.profile;
  const rawMaxRounds = (config as unknown as { maxRounds?: unknown })?.maxRounds;
  const rawMaxToolCalls = (config as unknown as { maxToolCalls?: unknown })?.maxToolCalls;
  const rawMaxVerifyRuns = (config as unknown as { maxVerifyRuns?: unknown })?.maxVerifyRuns;
  const rawFailureMode = (config as unknown as { failureMode?: unknown })?.failureMode;
  const rawAutoVerify = (config as unknown as { autoVerify?: unknown })?.autoVerify;
  const rawVerifyCommand = (config as unknown as { verifyCommand?: unknown })?.verifyCommand;

  return {
    enabledByDefault:
      rawEnabledByDefault === undefined
        ? BASE_DEFAULT_CONFIG_FILE.loop.enabledByDefault
        : (rawEnabledByDefault as boolean),
    profile:
      rawProfile === undefined
        ? BASE_DEFAULT_CONFIG_FILE.loop.profile
        : (rawProfile as LoopProfileName),
    maxRounds:
      rawMaxRounds === undefined
        ? BASE_DEFAULT_CONFIG_FILE.loop.maxRounds
        : (rawMaxRounds as number),
    ...(rawMaxToolCalls === undefined ? {} : { maxToolCalls: rawMaxToolCalls as number }),
    ...(rawMaxVerifyRuns === undefined ? {} : { maxVerifyRuns: rawMaxVerifyRuns as number }),
    failureMode:
      rawFailureMode === undefined
        ? BASE_DEFAULT_CONFIG_FILE.loop.failureMode
        : (rawFailureMode as LoopFailureMode),
    autoVerify:
      rawAutoVerify === undefined
        ? BASE_DEFAULT_CONFIG_FILE.loop.autoVerify
        : (rawAutoVerify as boolean),
    ...(rawVerifyCommand === undefined
      ? {}
      : { verifyCommand: rawVerifyCommand as string }),
  };
}

export function normalizeConfigFile(config?: Partial<GlmConfigFile>): GlmConfigFile {
  const rawDefaultProvider = (config as unknown as { defaultProvider?: unknown })?.defaultProvider;
  const rawDebugRuntime = (config as unknown as { debugRuntime?: unknown })?.debugRuntime;
  const rawEventLogLimit = (config as unknown as { eventLogLimit?: unknown })?.eventLogLimit;
  const rawHooksEnabled = (config as unknown as { hooksEnabled?: unknown })?.hooksEnabled;
  const rawHookTimeoutMs = (config as unknown as { hookTimeoutMs?: unknown })?.hookTimeoutMs;
  const defaultProvider =
    rawDefaultProvider === undefined
      ? BASE_DEFAULT_CONFIG_FILE.defaultProvider
      : (rawDefaultProvider as PersistedProviderName);

  return {
    defaultProvider,
    defaultModel: config?.defaultModel ?? BASE_DEFAULT_CONFIG_FILE.defaultModel,
    approvalPolicy: config?.approvalPolicy ?? BASE_DEFAULT_CONFIG_FILE.approvalPolicy,
    debugRuntime:
      rawDebugRuntime === undefined
        ? BASE_DEFAULT_CONFIG_FILE.debugRuntime
        : (rawDebugRuntime as boolean),
    eventLogLimit:
      rawEventLogLimit === undefined
        ? BASE_DEFAULT_CONFIG_FILE.eventLogLimit
        : (rawEventLogLimit as number),
    hooksEnabled:
      rawHooksEnabled === undefined
        ? BASE_DEFAULT_CONFIG_FILE.hooksEnabled
        : (rawHooksEnabled as boolean),
    hookTimeoutMs:
      rawHookTimeoutMs === undefined
        ? BASE_DEFAULT_CONFIG_FILE.hookTimeoutMs
        : (rawHookTimeoutMs as number),
    notifications: cloneNotificationsConfig(
      (config as unknown as { notifications?: NotificationsConfig })?.notifications ??
        BASE_DEFAULT_CONFIG_FILE.notifications,
    ),
    generation: cloneGenerationConfig(
      (config as unknown as { generation?: GenerationConfig })?.generation ??
        BASE_DEFAULT_CONFIG_FILE.generation,
    ),
    glmCapabilities: cloneGlmCapabilitiesConfig(
      (config as unknown as { glmCapabilities?: GlmCapabilitiesConfig })?.glmCapabilities ??
        BASE_DEFAULT_CONFIG_FILE.glmCapabilities,
    ),
    loop: cloneLoopConfig(
      (config as unknown as { loop?: LoopConfig })?.loop ??
        BASE_DEFAULT_CONFIG_FILE.loop,
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

function isLoopProfileName(value?: string): value is LoopProfileName {
  return VALID_LOOP_PROFILES.includes(value as LoopProfileName);
}

function isLoopFailureMode(value?: string): value is LoopFailureMode {
  return VALID_LOOP_FAILURE_MODES.includes(value as LoopFailureMode);
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
  if (typeof config.debugRuntime !== "boolean") {
    throw new Error(`Invalid debugRuntime in config file: ${typeof config.debugRuntime}`);
  }
  if (!Number.isInteger(config.eventLogLimit) || (config.eventLogLimit ?? 0) <= 0) {
    throw new Error(`Invalid eventLogLimit in config file: ${config.eventLogLimit}`);
  }
  if (typeof config.hooksEnabled !== "boolean") {
    throw new Error(`Invalid hooksEnabled in config file: ${typeof config.hooksEnabled}`);
  }
  if (!Number.isInteger(config.hookTimeoutMs) || (config.hookTimeoutMs ?? 0) <= 0) {
    throw new Error(`Invalid hookTimeoutMs in config file: ${config.hookTimeoutMs}`);
  }
  validateNotificationsConfig(config.notifications);

  validateGenerationConfig(config.generation);
  validateGlmCapabilitiesConfig(config.glmCapabilities);
  validateLoopConfig(config.loop);

  Object.entries(config.providers).forEach(([key, value]) => {
    validateProviderConfig(value, key as StorageProviderKey);
  });
}

function validateNotificationsConfig(config: NotificationsConfig): void {
  if (typeof config.enabled !== "boolean") {
    throw new Error(`Invalid notifications.enabled in config file: ${typeof config.enabled}`);
  }

  if (typeof config.onTurnEnd !== "boolean") {
    throw new Error(`Invalid notifications.onTurnEnd in config file: ${typeof config.onTurnEnd}`);
  }

  if (typeof config.onLoopResult !== "boolean") {
    throw new Error(`Invalid notifications.onLoopResult in config file: ${typeof config.onLoopResult}`);
  }
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

function validateLoopConfig(config: LoopConfig): void {
  if (typeof config.enabledByDefault !== "boolean") {
    throw new Error(`Invalid loop.enabledByDefault in config file: ${typeof config.enabledByDefault}`);
  }

  if (!isLoopProfileName(config.profile)) {
    throw new Error(`Invalid loop.profile in config file: ${config.profile}`);
  }

  if (!Number.isInteger(config.maxRounds) || (config.maxRounds ?? 0) <= 0) {
    throw new Error(`Invalid loop.maxRounds in config file: ${config.maxRounds}`);
  }

  if (
    config.maxToolCalls !== undefined &&
    (!Number.isInteger(config.maxToolCalls) || config.maxToolCalls <= 0)
  ) {
    throw new Error(`Invalid loop.maxToolCalls in config file: ${config.maxToolCalls}`);
  }

  if (
    config.maxVerifyRuns !== undefined &&
    (!Number.isInteger(config.maxVerifyRuns) || config.maxVerifyRuns <= 0)
  ) {
    throw new Error(`Invalid loop.maxVerifyRuns in config file: ${config.maxVerifyRuns}`);
  }

  if (!isLoopFailureMode(config.failureMode)) {
    throw new Error(`Invalid loop.failureMode in config file: ${config.failureMode}`);
  }

  if (typeof config.autoVerify !== "boolean") {
    throw new Error(`Invalid loop.autoVerify in config file: ${typeof config.autoVerify}`);
  }

  if (config.verifyCommand !== undefined && typeof config.verifyCommand !== "string") {
    throw new Error(`Invalid loop.verifyCommand in config file: ${typeof config.verifyCommand}`);
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
