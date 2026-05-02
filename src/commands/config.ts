import {
  getDefaultConfigFile,
  type LoopFailureMode,
  type LoopProfileName,
  readConfigFile,
  type ApprovalPolicy,
  type ContextCacheMode,
  type GlmConfigFile,
  type ResponseFormatType,
  type ThinkingMode,
  type ToolStreamMode,
  writeConfigFile,
} from "../app/config-store.js";
import {
  API_KINDS,
  PROVIDER_NAMES,
  normalizeApiKind,
  normalizeProviderName,
  type ApiKind,
  type ProviderName,
} from "../providers/types.js";

const CONFIG_KEYS = [
  "defaultProvider",
  "defaultApi",
  "defaultModel",
  "taskLaneDefault",
  "approvalPolicy",
  "debugRuntime",
  "eventLogLimit",
  "hooksEnabled",
  "hookTimeoutMs",
  "notificationsEnabled",
  "notificationsOnTurnEnd",
  "notificationsOnLoopResult",
  "maxOutputTokens",
  "temperature",
  "topP",
  "thinkingMode",
  "clearThinking",
  "toolStream",
  "responseFormat",
  "contextCache",
  "loopEnabledByDefault",
  "loopProfile",
  "loopMaxRounds",
  "loopMaxToolCalls",
  "loopMaxVerifyRuns",
  "loopFailureMode",
  "loopAutoVerify",
  "loopVerifyCommand",
] as const;
type ConfigKey = (typeof CONFIG_KEYS)[number];

const PROVIDER_VALUES = [...PROVIDER_NAMES] as const;
const API_VALUES = [...API_KINDS] as const;
const TASK_LANE_DEFAULTS = ["auto", "direct", "standard", "intensive"] as const;
const THINKING_MODES = ["auto", "enabled", "disabled"] as const;
const TOOL_STREAM_MODES = ["auto", "on", "off"] as const;
const RESPONSE_FORMAT_TYPES = ["json_object"] as const;
const CONTEXT_CACHE_MODES = ["auto", "explicit", "off"] as const;
const LOOP_PROFILES = ["code"] as const;
const LOOP_FAILURE_MODES = ["handoff", "fail"] as const;
const CLEARABLE_VALUE = "unset";

type ConfigDependencies = {
  readConfigFile: typeof readConfigFile;
  writeConfigFile: typeof writeConfigFile;
  log: (message: string) => void;
};

function isConfigKey(value: string): value is ConfigKey {
  return CONFIG_KEYS.includes(value as ConfigKey);
}

function getConfigValue(config: GlmConfigFile, key: ConfigKey): string {
  if (key === "defaultProvider") {
    return config.defaultProvider ?? "bigmodel-coding";
  }
  if (key === "defaultApi") {
    return config.defaultApi ?? "openai-compatible";
  }
  if (key === "defaultModel") {
    return config.defaultModel ?? "";
  }
  if (key === "taskLaneDefault") {
    return config.taskLaneDefault ?? "auto";
  }
  if (key === "approvalPolicy") {
    return config.approvalPolicy ?? "ask";
  }
  if (key === "debugRuntime") {
    return String(config.debugRuntime ?? false);
  }
  if (key === "eventLogLimit") {
    return String(config.eventLogLimit ?? 200);
  }
  if (key === "hooksEnabled") {
    return String(config.hooksEnabled ?? true);
  }
  if (key === "hookTimeoutMs") {
    return String(config.hookTimeoutMs ?? 5000);
  }
  if (key === "notificationsEnabled") {
    return String(config.notifications.enabled ?? false);
  }
  if (key === "notificationsOnTurnEnd") {
    return String(config.notifications.onTurnEnd ?? true);
  }
  if (key === "notificationsOnLoopResult") {
    return String(config.notifications.onLoopResult ?? true);
  }
  if (key === "maxOutputTokens") {
    return config.generation.maxOutputTokens?.toString() ?? CLEARABLE_VALUE;
  }
  if (key === "temperature") {
    return config.generation.temperature?.toString() ?? CLEARABLE_VALUE;
  }
  if (key === "topP") {
    return config.generation.topP?.toString() ?? CLEARABLE_VALUE;
  }
  if (key === "thinkingMode") {
    return config.glmCapabilities.thinkingMode ?? "auto";
  }
  if (key === "clearThinking") {
    return config.glmCapabilities.clearThinking === undefined
      ? CLEARABLE_VALUE
      : String(config.glmCapabilities.clearThinking);
  }
  if (key === "toolStream") {
    return config.glmCapabilities.toolStream ?? "auto";
  }
  if (key === "responseFormat") {
    return config.glmCapabilities.responseFormat ?? CLEARABLE_VALUE;
  }
  if (key === "contextCache") {
    return config.glmCapabilities.contextCache ?? "auto";
  }
  if (key === "loopEnabledByDefault") {
    return String(config.loop.enabledByDefault ?? false);
  }
  if (key === "loopProfile") {
    return config.loop.profile ?? "code";
  }
  if (key === "loopMaxRounds") {
    return config.loop.maxRounds?.toString() ?? "3";
  }
  if (key === "loopMaxToolCalls") {
    return config.loop.maxToolCalls?.toString() ?? CLEARABLE_VALUE;
  }
  if (key === "loopMaxVerifyRuns") {
    return config.loop.maxVerifyRuns?.toString() ?? CLEARABLE_VALUE;
  }
  if (key === "loopFailureMode") {
    return config.loop.failureMode ?? "handoff";
  }
  if (key === "loopAutoVerify") {
    return String(config.loop.autoVerify ?? true);
  }
  if (key === "loopVerifyCommand") {
    return config.loop.verifyCommand ?? CLEARABLE_VALUE;
  }
  return config.defaultModel ?? "";
}

function parseConfigValue(key: ConfigKey, value: string): string | number | boolean | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${key} cannot be empty`);
  }

  if (key === "defaultProvider") {
    const normalized = normalizeProviderName(trimmed);
    if (!normalized || !PROVIDER_VALUES.includes(normalized)) {
      throw new Error(`defaultProvider must be ${PROVIDER_VALUES.join(", ")}`);
    }
    return normalized as ProviderName;
  }

  if (key === "defaultApi") {
    const normalized = normalizeApiKind(trimmed);
    if (!normalized || !API_VALUES.includes(normalized)) {
      throw new Error(`defaultApi must be ${API_VALUES.join(", ")}`);
    }
    return normalized as ApiKind;
  }

  if (key === "taskLaneDefault") {
    if (!TASK_LANE_DEFAULTS.includes(trimmed as (typeof TASK_LANE_DEFAULTS)[number])) {
      throw new Error(`taskLaneDefault must be ${TASK_LANE_DEFAULTS.join(", ")}`);
    }
  }

  if (key === "approvalPolicy" && !["ask", "auto", "never"].includes(trimmed)) {
    throw new Error("approvalPolicy must be ask, auto, or never");
  }

  if (key === "debugRuntime") {
    if (trimmed !== "true" && trimmed !== "false") {
      throw new Error("debugRuntime must be true or false");
    }
    return trimmed === "true";
  }

  if (key === "eventLogLimit") {
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error("eventLogLimit must be a positive integer");
    }
    return parsed;
  }

  if (key === "hooksEnabled") {
    if (trimmed !== "true" && trimmed !== "false") {
      throw new Error("hooksEnabled must be true or false");
    }
    return trimmed === "true";
  }

  if (key === "hookTimeoutMs") {
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error("hookTimeoutMs must be a positive integer");
    }
    return parsed;
  }

  if (
    key === "notificationsEnabled" ||
    key === "notificationsOnTurnEnd" ||
    key === "notificationsOnLoopResult"
  ) {
    if (trimmed !== "true" && trimmed !== "false") {
      throw new Error(`${key} must be true or false`);
    }
    return trimmed === "true";
  }

  if (key === "thinkingMode") {
    if (!THINKING_MODES.includes(trimmed as (typeof THINKING_MODES)[number])) {
      throw new Error(`thinkingMode must be ${THINKING_MODES.join(", ")}`);
    }
  }

  if (key === "toolStream") {
    if (!TOOL_STREAM_MODES.includes(trimmed as (typeof TOOL_STREAM_MODES)[number])) {
      throw new Error(`toolStream must be ${TOOL_STREAM_MODES.join(", ")}`);
    }
  }

  if (key === "responseFormat") {
    if (trimmed === CLEARABLE_VALUE) {
      return undefined;
    }
    if (!RESPONSE_FORMAT_TYPES.includes(trimmed as (typeof RESPONSE_FORMAT_TYPES)[number])) {
      throw new Error(
        `responseFormat must be ${RESPONSE_FORMAT_TYPES.join(", ")}, or ${CLEARABLE_VALUE}`,
      );
    }
  }

  if (key === "contextCache") {
    if (!CONTEXT_CACHE_MODES.includes(trimmed as (typeof CONTEXT_CACHE_MODES)[number])) {
      throw new Error(`contextCache must be ${CONTEXT_CACHE_MODES.join(", ")}`);
    }
  }

  if (key === "loopProfile") {
    if (!LOOP_PROFILES.includes(trimmed as (typeof LOOP_PROFILES)[number])) {
      throw new Error(`loopProfile must be ${LOOP_PROFILES.join(", ")}`);
    }
  }

  if (key === "loopFailureMode") {
    if (!LOOP_FAILURE_MODES.includes(trimmed as (typeof LOOP_FAILURE_MODES)[number])) {
      throw new Error(`loopFailureMode must be ${LOOP_FAILURE_MODES.join(", ")}`);
    }
  }

  if (key === "clearThinking") {
    if (trimmed === CLEARABLE_VALUE) {
      return undefined;
    }
    if (trimmed !== "true" && trimmed !== "false") {
      throw new Error(`clearThinking must be true, false, or ${CLEARABLE_VALUE}`);
    }
    return trimmed === "true";
  }

  if (key === "maxOutputTokens") {
    if (trimmed === CLEARABLE_VALUE) {
      return undefined;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`maxOutputTokens must be a positive integer or ${CLEARABLE_VALUE}`);
    }
    return parsed;
  }

  if (key === "temperature" || key === "topP") {
    if (trimmed === CLEARABLE_VALUE) {
      return undefined;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${key} must be a number or ${CLEARABLE_VALUE}`);
    }
    if (key === "temperature" && parsed < 0) {
      throw new Error(`temperature must be >= 0 or ${CLEARABLE_VALUE}`);
    }
    if (key === "topP" && (parsed <= 0 || parsed > 1)) {
      throw new Error(`topP must be > 0 and <= 1 or ${CLEARABLE_VALUE}`);
    }
    return parsed;
  }

  if (key === "loopEnabledByDefault" || key === "loopAutoVerify") {
    if (trimmed !== "true" && trimmed !== "false") {
      throw new Error(`${key} must be true or false`);
    }
    return trimmed === "true";
  }

  if (key === "loopMaxRounds") {
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error("loopMaxRounds must be a positive integer");
    }
    return parsed;
  }

  if (key === "loopMaxToolCalls" || key === "loopMaxVerifyRuns") {
    if (trimmed === CLEARABLE_VALUE) {
      return undefined;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`${key} must be a positive integer or ${CLEARABLE_VALUE}`);
    }
    return parsed;
  }

  if (key === "loopVerifyCommand") {
    if (trimmed === CLEARABLE_VALUE) {
      return undefined;
    }
    return trimmed;
  }

  return trimmed;
}

export async function showConfig(): Promise<GlmConfigFile> {
  return readConfigFile();
}

export async function resetConfig(): Promise<GlmConfigFile> {
  const defaults = getDefaultConfigFile();
  await writeConfigFile(defaults);
  return defaults;
}

export async function configGet(key: string, deps?: Partial<ConfigDependencies>): Promise<string> {
  if (!isConfigKey(key)) {
    throw new Error(`Unknown config key: ${key}`);
  }

  const config = await (deps?.readConfigFile ?? readConfigFile)();
  const value = getConfigValue(config, key);
  (deps?.log ?? console.log)(value);
  return value;
}

export async function configSet(
  key: string,
  value: string,
  deps?: Partial<ConfigDependencies>,
): Promise<GlmConfigFile> {
  if (!isConfigKey(key)) {
    throw new Error(`Unknown config key: ${key}`);
  }

  const config = await (deps?.readConfigFile ?? readConfigFile)();
  const parsedValue = parseConfigValue(key, value);

  if (key === "defaultProvider") {
    config.defaultProvider = parsedValue as GlmConfigFile["defaultProvider"];
  } else if (key === "defaultApi") {
    config.defaultApi = parsedValue as GlmConfigFile["defaultApi"];
  } else if (key === "taskLaneDefault") {
    config.taskLaneDefault = parsedValue as GlmConfigFile["taskLaneDefault"];
  } else if (key === "approvalPolicy") {
    config.approvalPolicy = parsedValue as ApprovalPolicy;
  } else if (key === "debugRuntime") {
    config.debugRuntime = parsedValue as boolean;
  } else if (key === "eventLogLimit") {
    config.eventLogLimit = parsedValue as number;
  } else if (key === "hooksEnabled") {
    config.hooksEnabled = parsedValue as boolean;
  } else if (key === "hookTimeoutMs") {
    config.hookTimeoutMs = parsedValue as number;
  } else if (key === "notificationsEnabled") {
    config.notifications.enabled = parsedValue as boolean;
  } else if (key === "notificationsOnTurnEnd") {
    config.notifications.onTurnEnd = parsedValue as boolean;
  } else if (key === "notificationsOnLoopResult") {
    config.notifications.onLoopResult = parsedValue as boolean;
  } else if (key === "maxOutputTokens") {
    config.generation.maxOutputTokens = parsedValue as number | undefined;
  } else if (key === "temperature") {
    config.generation.temperature = parsedValue as number | undefined;
  } else if (key === "topP") {
    config.generation.topP = parsedValue as number | undefined;
  } else if (key === "thinkingMode") {
    config.glmCapabilities.thinkingMode = parsedValue as ThinkingMode;
  } else if (key === "clearThinking") {
    if (parsedValue === undefined) {
      delete config.glmCapabilities.clearThinking;
    } else {
      config.glmCapabilities.clearThinking = parsedValue as boolean;
    }
  } else if (key === "toolStream") {
    config.glmCapabilities.toolStream = parsedValue as ToolStreamMode;
  } else if (key === "responseFormat") {
    if (parsedValue === undefined) {
      delete config.glmCapabilities.responseFormat;
    } else {
      config.glmCapabilities.responseFormat = parsedValue as ResponseFormatType;
    }
  } else if (key === "contextCache") {
    config.glmCapabilities.contextCache = parsedValue as ContextCacheMode;
  } else if (key === "loopEnabledByDefault") {
    config.loop.enabledByDefault = parsedValue as boolean;
  } else if (key === "loopProfile") {
    config.loop.profile = parsedValue as LoopProfileName;
  } else if (key === "loopMaxRounds") {
    config.loop.maxRounds = parsedValue as number;
  } else if (key === "loopMaxToolCalls") {
    if (parsedValue === undefined) {
      delete config.loop.maxToolCalls;
    } else {
      config.loop.maxToolCalls = parsedValue as number;
    }
  } else if (key === "loopMaxVerifyRuns") {
    if (parsedValue === undefined) {
      delete config.loop.maxVerifyRuns;
    } else {
      config.loop.maxVerifyRuns = parsedValue as number;
    }
  } else if (key === "loopFailureMode") {
    config.loop.failureMode = parsedValue as LoopFailureMode;
  } else if (key === "loopAutoVerify") {
    config.loop.autoVerify = parsedValue as boolean;
  } else if (key === "loopVerifyCommand") {
    if (parsedValue === undefined) {
      delete config.loop.verifyCommand;
    } else {
      config.loop.verifyCommand = parsedValue as string;
    }
  } else {
    config.defaultModel = parsedValue as string;
  }

  await (deps?.writeConfigFile ?? writeConfigFile)(config);
  const loggedValue = parsedValue === undefined ? CLEARABLE_VALUE : String(parsedValue);
  (deps?.log ?? console.log)(`Updated ${key}=${loggedValue}`);
  return config;
}
