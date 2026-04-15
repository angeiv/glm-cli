import type { GlmConfigFile } from "./config-store.js";
import type { ProviderName } from "../providers/types.js";
import { resolveProviderSelection } from "../providers/index.js";

export type RuntimeCliFlags = {
  provider?: ProviderName;
  model?: string;
  yolo?: boolean;
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

export function resolveRuntimeConfig(
  cli: RuntimeCliFlags,
  env: RuntimeEnvVars,
  fileConfig: GlmConfigFile,
): RuntimeConfig {
  const fallbackProvider = fileConfig.defaultProvider ?? "glm";
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
  };
}
