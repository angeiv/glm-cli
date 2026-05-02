import { getGlmConfigPath, getGlmRootDir } from "./dirs.js";
import * as fsPromises from "node:fs/promises";
import type { GlmProfileOverrideRule } from "../models/resolve-glm-profile-v2.js";
import type { GlmInputModality } from "../models/glm-profile-core.js";
import {
  API_KINDS,
  PROVIDER_NAMES,
  type ApiKind,
  type ProviderName,
  resolveProviderInput,
} from "../providers/types.js";

export const fileSystem = {
  readFile: fsPromises.readFile,
  mkdir: fsPromises.mkdir,
  writeFile: fsPromises.writeFile,
};

export type ProviderConfig = {
  apiKey: string;
  baseURL: string;
  api?: ApiKind;
};

export type StorageProviderKey = ProviderName;
export type ApprovalPolicy = "ask" | "auto" | "never";
export type ThinkingMode = "auto" | "enabled" | "disabled";
export type ToolStreamMode = "auto" | "on" | "off";
export type ResponseFormatType = "json_object";
export type ContextCacheMode = "auto" | "explicit" | "off";
export type TaskLaneDefault = "auto" | "direct" | "standard" | "intensive";
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
  contextCache?: ContextCacheMode;
};
export type ModelProfilesConfig = {
  overrides?: GlmProfileOverrideRule[];
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

type PersistedProviderName = ProviderName;
const PERSISTED_PROVIDER_NAMES: PersistedProviderName[] = [...PROVIDER_NAMES];

const VALID_APPROVAL_POLICIES: ApprovalPolicy[] = ["ask", "auto", "never"];
const VALID_THINKING_MODES: ThinkingMode[] = ["auto", "enabled", "disabled"];
const VALID_TOOL_STREAM_MODES: ToolStreamMode[] = ["auto", "on", "off"];
const VALID_RESPONSE_FORMAT_TYPES: ResponseFormatType[] = ["json_object"];
const VALID_CONTEXT_CACHE_MODES: ContextCacheMode[] = ["auto", "explicit", "off"];
const VALID_API_KINDS: ApiKind[] = [...API_KINDS];
const VALID_TASK_LANE_DEFAULTS: TaskLaneDefault[] = ["auto", "direct", "standard", "intensive"];
const VALID_LOOP_PROFILES: LoopProfileName[] = ["code"];
const VALID_LOOP_FAILURE_MODES: LoopFailureMode[] = ["handoff", "fail"];
const VALID_GLM_INPUT_MODALITIES: GlmInputModality[] = ["text", "image", "video"];

const BASE_DEFAULT_CONFIG_FILE = buildDefaultConfigFile();

function createEmptyProviderConfig(): ProviderConfig {
  return { apiKey: "", baseURL: "" };
}

function createDefaultProvidersConfig(): Record<StorageProviderKey, ProviderConfig> {
  return Object.fromEntries(
    PROVIDER_NAMES.map((provider) => [provider, createEmptyProviderConfig()]),
  ) as Record<StorageProviderKey, ProviderConfig>;
}

function createDefaultGenerationConfig(): GenerationConfig {
  return {};
}

function createDefaultGlmCapabilitiesConfig(): GlmCapabilitiesConfig {
  return {
    thinkingMode: "auto",
    toolStream: "auto",
    contextCache: "auto",
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
    defaultProvider: "bigmodel-coding",
    defaultModel: "glm-5.1",
    defaultApi: "openai-compatible",
    taskLaneDefault: "auto",
    approvalPolicy: "ask",
    debugRuntime: false,
    eventLogLimit: 200,
    hooksEnabled: true,
    hookTimeoutMs: 5000,
    notifications: createDefaultNotificationsConfig(),
    generation: createDefaultGenerationConfig(),
    glmCapabilities: createDefaultGlmCapabilitiesConfig(),
    loop: createDefaultLoopConfig(),
    providers: createDefaultProvidersConfig(),
  };
}

export type GlmConfigFile = {
  defaultProvider?: PersistedProviderName;
  defaultApi?: ApiKind;
  defaultModel?: string;
  taskLaneDefault?: TaskLaneDefault;
  approvalPolicy?: ApprovalPolicy;
  debugRuntime?: boolean;
  eventLogLimit?: number;
  hooksEnabled?: boolean;
  hookTimeoutMs?: number;
  notifications: NotificationsConfig;
  generation: GenerationConfig;
  glmCapabilities: GlmCapabilitiesConfig;
  loop: LoopConfig;
  modelProfiles?: ModelProfilesConfig;
  providers: Record<StorageProviderKey, ProviderConfig>;
};

function cloneProviderConfig(config?: ProviderConfig): ProviderConfig {
  const base: ProviderConfig = {
    apiKey: config?.apiKey ?? "",
    baseURL: config?.baseURL ?? "",
  };

  const apiRaw = (config as unknown as { api?: unknown })?.api;
  if (apiRaw === undefined) {
    return base;
  }

  if (typeof apiRaw !== "string") {
    return { ...(base as any), api: apiRaw } as ProviderConfig;
  }

  const api = apiRaw.trim();
  if (!api) return base;

  return { ...base, api: api as ApiKind };
}

function extractLegacyProviderConfig(
  providers: Record<string, unknown> | undefined,
  provider: ProviderName,
): ProviderConfig | undefined {
  if (!providers) return undefined;

  const direct = providers[provider];
  if (direct !== undefined) {
    return cloneProviderConfig(direct as ProviderConfig);
  }

  for (const [key, value] of Object.entries(providers)) {
    const resolved = resolveProviderInput(key);
    if (resolved?.provider !== provider) continue;
    const cloned = cloneProviderConfig(value as ProviderConfig);
    if (cloned.api === undefined && resolved.apiHint) {
      cloned.api = resolved.apiHint;
    }
    return cloned;
  }

  return undefined;
}

function cloneGenerationConfig(config?: GenerationConfig): GenerationConfig {
  const maxOutputTokens =
    typeof config?.maxOutputTokens === "number" ? config.maxOutputTokens : undefined;
  const temperature = typeof config?.temperature === "number" ? config.temperature : undefined;
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
  const rawContextCache = (config as unknown as { contextCache?: unknown })?.contextCache;

  return {
    thinkingMode:
      rawThinkingMode === undefined
        ? BASE_DEFAULT_CONFIG_FILE.glmCapabilities.thinkingMode
        : (rawThinkingMode as ThinkingMode),
    ...(rawClearThinking === undefined ? {} : { clearThinking: rawClearThinking as boolean }),
    toolStream:
      rawToolStream === undefined
        ? BASE_DEFAULT_CONFIG_FILE.glmCapabilities.toolStream
        : (rawToolStream as ToolStreamMode),
    ...(rawResponseFormat === undefined
      ? {}
      : { responseFormat: rawResponseFormat as ResponseFormatType }),
    contextCache:
      rawContextCache === undefined
        ? BASE_DEFAULT_CONFIG_FILE.glmCapabilities.contextCache
        : (rawContextCache as ContextCacheMode),
  };
}

function cloneLoopConfig(config?: LoopConfig): LoopConfig {
  const rawEnabledByDefault = (config as unknown as { enabledByDefault?: unknown })
    ?.enabledByDefault;
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
    ...(rawVerifyCommand === undefined ? {} : { verifyCommand: rawVerifyCommand as string }),
  };
}

function cloneModelProfilesConfig(config?: ModelProfilesConfig): ModelProfilesConfig | undefined {
  const rawOverrides = (config as unknown as { overrides?: unknown })?.overrides;
  if (rawOverrides === undefined) {
    return undefined;
  }

  if (!Array.isArray(rawOverrides)) {
    // Preserve invalid values so validation can surface a helpful error.
    return { ...(config as any) } as ModelProfilesConfig;
  }

  if (rawOverrides.length === 0) {
    return undefined;
  }

  const overrides = rawOverrides.map((rule) => {
    if (!rule || typeof rule !== "object") {
      return rule as GlmProfileOverrideRule;
    }

    const record = rule as Record<string, unknown>;
    const match = record.match;
    const caps = record.caps;

    return {
      ...record,
      ...(match && typeof match === "object"
        ? { match: { ...(match as Record<string, unknown>) } }
        : { match }),
      ...(Array.isArray(record.modalities) ? { modalities: [...record.modalities] } : {}),
      ...(caps && typeof caps === "object"
        ? { caps: { ...(caps as Record<string, unknown>) } }
        : { caps }),
    } as GlmProfileOverrideRule;
  });

  return { overrides };
}

export function normalizeConfigFile(config?: Partial<GlmConfigFile>): GlmConfigFile {
  const rawDefaultProvider = (config as unknown as { defaultProvider?: unknown })?.defaultProvider;
  const rawDefaultApi = (config as unknown as { defaultApi?: unknown })?.defaultApi;
  const rawTaskLaneDefault = (config as unknown as { taskLaneDefault?: unknown })?.taskLaneDefault;
  const rawDebugRuntime = (config as unknown as { debugRuntime?: unknown })?.debugRuntime;
  const rawEventLogLimit = (config as unknown as { eventLogLimit?: unknown })?.eventLogLimit;
  const rawHooksEnabled = (config as unknown as { hooksEnabled?: unknown })?.hooksEnabled;
  const rawHookTimeoutMs = (config as unknown as { hookTimeoutMs?: unknown })?.hookTimeoutMs;
  const defaultProviderInput =
    typeof rawDefaultProvider === "string" ? resolveProviderInput(rawDefaultProvider) : undefined;
  const defaultProvider =
    defaultProviderInput?.provider ??
    (rawDefaultProvider === undefined
      ? BASE_DEFAULT_CONFIG_FILE.defaultProvider
      : (rawDefaultProvider as PersistedProviderName));
  const rawProviders = (config as unknown as { providers?: Record<string, unknown> })?.providers;
  const modelProfiles = cloneModelProfilesConfig(
    (config as unknown as { modelProfiles?: ModelProfilesConfig })?.modelProfiles,
  );

  return {
    defaultProvider,
    defaultApi:
      rawDefaultApi === undefined
        ? (defaultProviderInput?.apiHint ?? BASE_DEFAULT_CONFIG_FILE.defaultApi)
        : (rawDefaultApi as ApiKind),
    defaultModel: config?.defaultModel ?? BASE_DEFAULT_CONFIG_FILE.defaultModel,
    taskLaneDefault:
      rawTaskLaneDefault === undefined
        ? BASE_DEFAULT_CONFIG_FILE.taskLaneDefault
        : (rawTaskLaneDefault as TaskLaneDefault),
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
      (config as unknown as { loop?: LoopConfig })?.loop ?? BASE_DEFAULT_CONFIG_FILE.loop,
    ),
    ...(modelProfiles ? { modelProfiles } : {}),
    providers: Object.fromEntries(
      PROVIDER_NAMES.map((provider) => [
        provider,
        cloneProviderConfig(
          extractLegacyProviderConfig(rawProviders, provider) ??
            BASE_DEFAULT_CONFIG_FILE.providers[provider],
        ),
      ]),
    ) as Record<StorageProviderKey, ProviderConfig>,
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

function isContextCacheMode(value?: string): value is ContextCacheMode {
  return VALID_CONTEXT_CACHE_MODES.includes(value as ContextCacheMode);
}

function isApiKind(value?: string): value is ApiKind {
  return VALID_API_KINDS.includes(value as ApiKind);
}

function isTaskLaneDefault(value?: string): value is TaskLaneDefault {
  return VALID_TASK_LANE_DEFAULTS.includes(value as TaskLaneDefault);
}

function isLoopProfileName(value?: string): value is LoopProfileName {
  return VALID_LOOP_PROFILES.includes(value as LoopProfileName);
}

function isLoopFailureMode(value?: string): value is LoopFailureMode {
  return VALID_LOOP_FAILURE_MODES.includes(value as LoopFailureMode);
}

function isGlmInputModality(value: unknown): value is GlmInputModality {
  return VALID_GLM_INPUT_MODALITIES.includes(value as GlmInputModality);
}

function validateConfigFile(config: GlmConfigFile): void {
  if (!isPersistedProviderName(config.defaultProvider)) {
    throw new Error(`Invalid default provider in config file: ${config.defaultProvider}`);
  }

  if (config.defaultApi !== undefined && !isApiKind(config.defaultApi)) {
    throw new Error(`Invalid defaultApi in config file: ${config.defaultApi}`);
  }

  if (typeof config.defaultModel !== "string") {
    throw new Error(`Invalid defaultModel in config file: ${typeof config.defaultModel}`);
  }

  if (!isTaskLaneDefault(config.taskLaneDefault)) {
    throw new Error(`Invalid taskLaneDefault in config file: ${config.taskLaneDefault}`);
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
  validateModelProfilesConfig(config.modelProfiles);

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
    throw new Error(
      `Invalid notifications.onLoopResult in config file: ${typeof config.onLoopResult}`,
    );
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

  if (config.responseFormat !== undefined && !isResponseFormatType(config.responseFormat)) {
    throw new Error(`Invalid responseFormat in config file: ${config.responseFormat}`);
  }

  if (!isContextCacheMode(config.contextCache)) {
    throw new Error(`Invalid contextCache in config file: ${config.contextCache}`);
  }
}

function validateLoopConfig(config: LoopConfig): void {
  if (typeof config.enabledByDefault !== "boolean") {
    throw new Error(
      `Invalid loop.enabledByDefault in config file: ${typeof config.enabledByDefault}`,
    );
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

const GLM_MODEL_CAP_KEYS = new Set([
  "contextWindow",
  "maxOutputTokens",
  "supportsThinking",
  "defaultThinkingMode",
  "supportsPreservedThinking",
  "supportsStreaming",
  "supportsToolCall",
  "supportsToolStream",
  "supportsCache",
  "supportsStructuredOutput",
  "supportsMcp",
]);

function validateModelProfilesConfig(config?: ModelProfilesConfig): void {
  if (config === undefined) return;
  if (typeof config !== "object" || config === null) {
    throw new Error(`Invalid modelProfiles in config file: ${typeof config}`);
  }

  const overrides = (config as unknown as { overrides?: unknown })?.overrides;
  if (overrides === undefined) {
    return;
  }

  if (!Array.isArray(overrides)) {
    throw new Error(`Invalid modelProfiles.overrides in config file: ${typeof overrides}`);
  }

  overrides.forEach((rule, index) => {
    if (typeof rule !== "object" || rule === null) {
      throw new Error(`Invalid modelProfiles.overrides[${index}] in config file: ${typeof rule}`);
    }

    const record = rule as Record<string, unknown>;
    const match = record.match;
    if (typeof match !== "object" || match === null) {
      throw new Error(
        `Invalid modelProfiles.overrides[${index}].match in config file: ${typeof match}`,
      );
    }

    const matchRecord = match as Record<string, unknown>;
    const matchKeys = [
      "provider",
      "api",
      "baseUrl",
      "modelId",
      "canonicalModelId",
      "platform",
      "upstreamVendor",
    ] as const;
    const populatedKeys = matchKeys.filter((key) => {
      const value = matchRecord[key];
      if (value === undefined) return false;
      if (typeof value !== "string") {
        throw new Error(
          `Invalid modelProfiles.overrides[${index}].match.${key} in config file: ${typeof value}`,
        );
      }
      if (!value.trim()) {
        throw new Error(
          `Invalid modelProfiles.overrides[${index}].match.${key} in config file: empty string`,
        );
      }
      return true;
    });

    if (populatedKeys.length === 0) {
      throw new Error(
        `Invalid modelProfiles.overrides[${index}] in config file: match must specify at least one selector`,
      );
    }

    const canonicalModelId = record.canonicalModelId;
    if (canonicalModelId !== undefined) {
      if (typeof canonicalModelId !== "string") {
        throw new Error(
          `Invalid modelProfiles.overrides[${index}].canonicalModelId in config file: ${typeof canonicalModelId}`,
        );
      }
      if (!canonicalModelId.trim()) {
        throw new Error(
          `Invalid modelProfiles.overrides[${index}].canonicalModelId in config file: empty string`,
        );
      }
    }

    const payloadPatchPolicy = record.payloadPatchPolicy;
    if (payloadPatchPolicy !== undefined) {
      if (payloadPatchPolicy !== "glm-native" && payloadPatchPolicy !== "safe-openai-compatible") {
        throw new Error(
          `Invalid modelProfiles.overrides[${index}].payloadPatchPolicy in config file: ${String(payloadPatchPolicy)}`,
        );
      }
    }

    const modalities = record.modalities;
    if (modalities !== undefined) {
      if (!Array.isArray(modalities) || modalities.length === 0) {
        throw new Error(
          `Invalid modelProfiles.overrides[${index}].modalities in config file: ${String(modalities)}`,
        );
      }

      modalities.forEach((value, modalityIndex) => {
        if (!isGlmInputModality(value)) {
          throw new Error(
            `Invalid modelProfiles.overrides[${index}].modalities[${modalityIndex}] in config file: ${String(value)}`,
          );
        }
      });
    }

    const caps = record.caps;
    if (caps === undefined) {
      return;
    }

    if (typeof caps !== "object" || caps === null) {
      throw new Error(
        `Invalid modelProfiles.overrides[${index}].caps in config file: ${typeof caps}`,
      );
    }

    for (const [key, value] of Object.entries(caps)) {
      if (!GLM_MODEL_CAP_KEYS.has(key)) {
        throw new Error(`Invalid modelProfiles.overrides[${index}].caps key: ${key}`);
      }

      if (key === "contextWindow" || key === "maxOutputTokens") {
        if (!Number.isInteger(value) || (value as number) <= 0) {
          throw new Error(
            `Invalid modelProfiles.overrides[${index}].caps.${key} in config file: ${String(value)}`,
          );
        }
        continue;
      }

      if (key === "defaultThinkingMode") {
        if (value !== "auto" && value !== "enabled" && value !== "disabled") {
          throw new Error(
            `Invalid modelProfiles.overrides[${index}].caps.defaultThinkingMode in config file: ${String(value)}`,
          );
        }
        continue;
      }

      if (typeof value !== "boolean") {
        throw new Error(
          `Invalid modelProfiles.overrides[${index}].caps.${key} in config file: ${typeof value}`,
        );
      }
    }
  });
}

function validateProviderConfig(config: ProviderConfig, key: StorageProviderKey): void {
  if (typeof config.apiKey !== "string") {
    throw new Error(`Invalid apiKey for provider ${key}: ${typeof config.apiKey}`);
  }
  if (typeof config.baseURL !== "string") {
    throw new Error(`Invalid baseURL for provider ${key}: ${typeof config.baseURL}`);
  }

  const api = (config as unknown as { api?: unknown })?.api;
  if (api !== undefined && (typeof api !== "string" || !isApiKind(api))) {
    throw new Error(`Invalid api for provider ${key}: ${String(api)}`);
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
