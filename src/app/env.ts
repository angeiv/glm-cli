import type { GlmConfigFile, ProviderName } from "./config-store.js";

export type RuntimeCliFlags = {
  provider?: ProviderName;
  model?: string;
  yolo?: boolean;
};

export type RuntimeEnvVars = Partial<{
  GLM_PROVIDER: string;
  GLM_MODEL: string;
  OPENAI_MODEL: string;
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
  const provider =
    normalizeProviderName(cli.provider) ??
    normalizeProviderName(env.GLM_PROVIDER) ??
    fileConfig.defaultProvider ??
    "glm-official";

  const model =
    cli.model ??
    env.GLM_MODEL ??
    env.OPENAI_MODEL ??
    env.ANTHROPIC_MODEL ??
    fileConfig.defaultModel ??
    "glm-5";

  const approvalPolicy = cli.yolo ? "never" : fileConfig.approvalPolicy ?? "ask";

  return { provider, model, approvalPolicy };
}

function normalizeProviderName(value?: string): ProviderName | undefined {
  if (value === "glm-official" || value === "openai-compatible") {
    return value;
  }
  return undefined;
}
