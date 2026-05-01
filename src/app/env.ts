import type {
  GlmConfigFile,
  LoopFailureMode,
  LoopProfileName,
  NotificationsConfig,
} from "./config-store.js";
import type { ProviderName } from "../providers/types.js";
import { isProviderName } from "../providers/types.js";
import { resolveProviderSelection } from "../providers/index.js";

export type RuntimeCliFlags = {
  provider?: ProviderName;
  model?: string;
  yolo?: boolean;
  loop?: boolean;
  verify?: string;
  maxRounds?: number;
  maxToolCalls?: number;
  maxVerifyRuns?: number;
  failMode?: LoopFailureMode;
};

export type RuntimeEnvVars = Partial<{
  GLM_PROVIDER: string;
  GLM_MODEL: string;
  GLM_ENDPOINT: string;
  GLM_MAX_OUTPUT_TOKENS: string;
  GLM_TEMPERATURE: string;
  GLM_TOP_P: string;
  GLM_THINKING_MODE: string;
  GLM_CLEAR_THINKING: string;
  GLM_TOOL_STREAM: string;
  GLM_RESPONSE_FORMAT: string;
  GLM_CONTEXT_CACHE: string;
  GLM_LOOP_ENABLED: string;
  GLM_LOOP_PROFILE: string;
  GLM_LOOP_MAX_ROUNDS: string;
  GLM_LOOP_MAX_TOOL_CALLS: string;
  GLM_LOOP_MAX_VERIFY_RUNS: string;
  GLM_LOOP_FAILURE_MODE: string;
  GLM_LOOP_AUTO_VERIFY: string;
  GLM_LOOP_VERIFY_COMMAND: string;
  GLM_LOOP_VERIFY_FALLBACK_COMMAND: string;
  GLM_NOTIFY_ENABLED: string;
  GLM_NOTIFY_ON_TURN_END: string;
  GLM_NOTIFY_ON_LOOP_RESULT: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  ANTHROPIC_AUTH_TOKEN: string;
  ANTHROPIC_MODEL: string;
}>;

export type RuntimeConfig = {
  provider: ProviderName;
  model: string;
  approvalPolicy: "ask" | "auto" | "never";
};

export type DiagnosticsRuntimeOptions = {
  debugRuntime: boolean;
  eventLogLimit: number;
};

export type NotificationRuntimeOptions = {
  enabled: boolean;
  onTurnEnd: boolean;
  onLoopResult: boolean;
};

export type LoopRuntimeOptions = {
  enabled: boolean;
  profile: LoopProfileName;
  maxRounds: number;
  maxToolCalls?: number;
  maxVerifyRuns?: number;
  failureMode: LoopFailureMode;
  autoVerify: boolean;
  /** Explicit verifier command (CLI flag or GLM_LOOP_VERIFY_COMMAND). */
  verifyCommand?: string;
  /** Fallback verifier command (config or GLM_LOOP_VERIFY_FALLBACK_COMMAND). */
  verifyFallbackCommand?: string;
};

export function resolveRuntimeConfig(
  cli: RuntimeCliFlags,
  env: RuntimeEnvVars,
  fileConfig: GlmConfigFile,
): RuntimeConfig {
  const fallbackProvider = isProviderName(fileConfig.defaultProvider) ? fileConfig.defaultProvider : "glm";
  const fallbackModel = fileConfig.defaultModel ?? "glm-5.1";

  const { provider, model } = resolveProviderSelection(
    { provider: cli.provider, model: cli.model },
    env as NodeJS.ProcessEnv,
    fallbackProvider,
    fallbackModel,
  );

  const approvalPolicy = cli.yolo ? "never" : fileConfig.approvalPolicy ?? "ask";

  return { provider, model, approvalPolicy };
}

function readConfiguredEnvValue(
  envValue: string | undefined,
  fallback: string | undefined,
): string | undefined {
  if (typeof envValue === "string" && envValue.trim() !== "") {
    return envValue;
  }

  return fallback;
}

export function buildCapabilityEnvironment(
  env: RuntimeEnvVars,
  fileConfig: GlmConfigFile,
): Partial<NodeJS.ProcessEnv> {
  return {
    ...(readConfiguredEnvValue(
      env.GLM_ENDPOINT,
      fileConfig.providers?.glm?.endpoint,
    ) === undefined
      ? {}
      : {
          GLM_ENDPOINT: readConfiguredEnvValue(
            env.GLM_ENDPOINT,
            fileConfig.providers?.glm?.endpoint,
          )!,
        }),
    ...(readConfiguredEnvValue(
      env.GLM_MAX_OUTPUT_TOKENS,
      fileConfig.generation?.maxOutputTokens?.toString(),
    ) === undefined
      ? {}
      : {
          GLM_MAX_OUTPUT_TOKENS: readConfiguredEnvValue(
            env.GLM_MAX_OUTPUT_TOKENS,
            fileConfig.generation?.maxOutputTokens?.toString(),
          )!,
        }),
    ...(readConfiguredEnvValue(
      env.GLM_TEMPERATURE,
      fileConfig.generation?.temperature?.toString(),
    ) === undefined
      ? {}
      : {
          GLM_TEMPERATURE: readConfiguredEnvValue(
            env.GLM_TEMPERATURE,
            fileConfig.generation?.temperature?.toString(),
          )!,
        }),
    ...(readConfiguredEnvValue(
      env.GLM_TOP_P,
      fileConfig.generation?.topP?.toString(),
    ) === undefined
      ? {}
      : {
          GLM_TOP_P: readConfiguredEnvValue(
            env.GLM_TOP_P,
            fileConfig.generation?.topP?.toString(),
          )!,
        }),
    ...(readConfiguredEnvValue(
      env.GLM_THINKING_MODE,
      fileConfig.glmCapabilities?.thinkingMode,
    ) === undefined
      ? {}
      : {
          GLM_THINKING_MODE: readConfiguredEnvValue(
            env.GLM_THINKING_MODE,
            fileConfig.glmCapabilities?.thinkingMode,
          )!,
        }),
    ...(readConfiguredEnvValue(
      env.GLM_CLEAR_THINKING,
      fileConfig.glmCapabilities?.clearThinking === undefined
        ? undefined
        : fileConfig.glmCapabilities.clearThinking
          ? "1"
          : "0",
    ) === undefined
      ? {}
      : {
          GLM_CLEAR_THINKING: readConfiguredEnvValue(
            env.GLM_CLEAR_THINKING,
            fileConfig.glmCapabilities?.clearThinking === undefined
              ? undefined
              : fileConfig.glmCapabilities.clearThinking
                ? "1"
                : "0",
          )!,
        }),
    ...(readConfiguredEnvValue(
      env.GLM_TOOL_STREAM,
      fileConfig.glmCapabilities?.toolStream,
    ) === undefined
      ? {}
      : {
          GLM_TOOL_STREAM: readConfiguredEnvValue(
            env.GLM_TOOL_STREAM,
            fileConfig.glmCapabilities?.toolStream,
          )!,
        }),
    ...(readConfiguredEnvValue(
      env.GLM_RESPONSE_FORMAT,
      fileConfig.glmCapabilities?.responseFormat,
    ) === undefined
      ? {}
      : {
          GLM_RESPONSE_FORMAT: readConfiguredEnvValue(
            env.GLM_RESPONSE_FORMAT,
            fileConfig.glmCapabilities?.responseFormat,
          )!,
        }),
    ...(readConfiguredEnvValue(
      env.GLM_CONTEXT_CACHE,
      fileConfig.glmCapabilities?.contextCache,
    ) === undefined
      ? {}
      : {
          GLM_CONTEXT_CACHE: readConfiguredEnvValue(
            env.GLM_CONTEXT_CACHE,
            fileConfig.glmCapabilities?.contextCache,
          )!,
        }),
  };
}

export function resolveNotificationRuntimeOptions(
  env: RuntimeEnvVars,
  fileConfig: GlmConfigFile,
): NotificationRuntimeOptions {
  const notifications: NotificationsConfig | undefined = fileConfig.notifications;
  const envEnabled = parseBoolean(env.GLM_NOTIFY_ENABLED);
  const envOnTurnEnd = parseBoolean(env.GLM_NOTIFY_ON_TURN_END);
  const envOnLoopResult = parseBoolean(env.GLM_NOTIFY_ON_LOOP_RESULT);

  return {
    enabled: envEnabled ?? notifications?.enabled ?? false,
    onTurnEnd: envOnTurnEnd ?? notifications?.onTurnEnd ?? true,
    onLoopResult: envOnLoopResult ?? notifications?.onLoopResult ?? true,
  };
}

export function buildNotificationEnvironment(
  env: RuntimeEnvVars,
  fileConfig: GlmConfigFile,
): Partial<NodeJS.ProcessEnv> {
  const resolved = resolveNotificationRuntimeOptions(env, fileConfig);

  return {
    GLM_NOTIFY_ENABLED: resolved.enabled ? "1" : "0",
    GLM_NOTIFY_ON_TURN_END: resolved.onTurnEnd ? "1" : "0",
    GLM_NOTIFY_ON_LOOP_RESULT: resolved.onLoopResult ? "1" : "0",
  };
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return undefined;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function parseLoopFailureMode(value: string | undefined): LoopFailureMode | undefined {
  if (value === "handoff" || value === "fail") return value;
  return undefined;
}

function parseLoopProfile(value: string | undefined): LoopProfileName | undefined {
  if (value === "code") return value;
  return undefined;
}

export function resolveLoopRuntimeOptions(
  cli: RuntimeCliFlags,
  env: RuntimeEnvVars,
  fileConfig: GlmConfigFile,
): LoopRuntimeOptions {
  const fileLoop = fileConfig.loop;
  const envEnabled = parseBoolean(env.GLM_LOOP_ENABLED);
  const envProfile = parseLoopProfile(env.GLM_LOOP_PROFILE);
  const envMaxRounds = parsePositiveInteger(env.GLM_LOOP_MAX_ROUNDS);
  const envMaxToolCalls = parsePositiveInteger(env.GLM_LOOP_MAX_TOOL_CALLS);
  const envMaxVerifyRuns = parsePositiveInteger(env.GLM_LOOP_MAX_VERIFY_RUNS);
  const envFailureMode = parseLoopFailureMode(env.GLM_LOOP_FAILURE_MODE);
  const envAutoVerify = parseBoolean(env.GLM_LOOP_AUTO_VERIFY);
  const envVerifyCommand = readConfiguredEnvValue(
    env.GLM_LOOP_VERIFY_COMMAND,
    undefined,
  );
  const envVerifyFallbackCommand = readConfiguredEnvValue(
    env.GLM_LOOP_VERIFY_FALLBACK_COMMAND,
    undefined,
  );

  const maxToolCalls = cli.maxToolCalls ?? envMaxToolCalls ?? fileLoop?.maxToolCalls;
  const maxVerifyRuns = cli.maxVerifyRuns ?? envMaxVerifyRuns ?? fileLoop?.maxVerifyRuns;

  return {
    enabled:
      cli.loop ??
      envEnabled ??
      fileLoop?.enabledByDefault ??
      false,
    profile:
      envProfile ??
      fileLoop?.profile ??
      "code",
    maxRounds:
      cli.maxRounds ??
      envMaxRounds ??
      fileLoop?.maxRounds ??
      3,
    ...(maxToolCalls === undefined ? {} : { maxToolCalls }),
    ...(maxVerifyRuns === undefined ? {} : { maxVerifyRuns }),
    failureMode:
      cli.failMode ??
      envFailureMode ??
      fileLoop?.failureMode ??
      "handoff",
    autoVerify:
      envAutoVerify ??
      fileLoop?.autoVerify ??
      true,
    verifyCommand: cli.verify ?? envVerifyCommand,
    verifyFallbackCommand: envVerifyFallbackCommand ?? fileLoop?.verifyCommand,
  };
}

export function buildLoopEnvironment(
  loop: LoopRuntimeOptions,
): Partial<NodeJS.ProcessEnv> {
  return {
    GLM_LOOP_ENABLED: loop.enabled ? "1" : "0",
    GLM_LOOP_PROFILE: loop.profile,
    GLM_LOOP_MAX_ROUNDS: String(loop.maxRounds),
    ...(loop.maxToolCalls === undefined
      ? { GLM_LOOP_MAX_TOOL_CALLS: undefined }
      : { GLM_LOOP_MAX_TOOL_CALLS: String(loop.maxToolCalls) }),
    ...(loop.maxVerifyRuns === undefined
      ? { GLM_LOOP_MAX_VERIFY_RUNS: undefined }
      : { GLM_LOOP_MAX_VERIFY_RUNS: String(loop.maxVerifyRuns) }),
    GLM_LOOP_FAILURE_MODE: loop.failureMode,
    GLM_LOOP_AUTO_VERIFY: loop.autoVerify ? "1" : "0",
    ...(loop.verifyCommand ? { GLM_LOOP_VERIFY_COMMAND: loop.verifyCommand } : { GLM_LOOP_VERIFY_COMMAND: undefined }),
    ...(loop.verifyFallbackCommand ? { GLM_LOOP_VERIFY_FALLBACK_COMMAND: loop.verifyFallbackCommand } : { GLM_LOOP_VERIFY_FALLBACK_COMMAND: undefined }),
  };
}

export function resolveDiagnosticsRuntimeOptions(
  fileConfig: GlmConfigFile,
): DiagnosticsRuntimeOptions {
  return {
    debugRuntime: fileConfig.debugRuntime ?? false,
    eventLogLimit: fileConfig.eventLogLimit ?? 200,
  };
}
