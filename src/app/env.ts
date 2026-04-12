import type { GlmConfigFile, ProviderName } from "./config-store.js";
import { resolveProviderSelection } from "../providers/index.js";

export type RuntimeCliFlags = {
  provider?: ProviderName;
  model?: string;
  yolo?: boolean;
};

export type RuntimeEnvVars = Partial<{
  GLM_PROVIDER: string;
  GLM_MODEL: string;
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
  const fallbackProvider = fileConfig.defaultProvider ?? "glm-official";
  const fallbackModel = fileConfig.defaultModel ?? "glm-5";

  const { provider, model } = resolveProviderSelection(
    { provider: cli.provider, model: cli.model },
    env as NodeJS.ProcessEnv,
    fallbackProvider,
    fallbackModel,
  );

  const approvalPolicy = cli.yolo ? "never" : fileConfig.approvalPolicy ?? "ask";

  return { provider, model, approvalPolicy };
}
