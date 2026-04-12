import type { ProviderName } from "./types.js";
import { normalizeProviderName } from "./types.js";

type ResolveProviderArgs = {
  provider?: ProviderName;
  model?: string;
};

export function resolveProviderSelection(
  cli: ResolveProviderArgs,
  env: NodeJS.ProcessEnv,
  fallbackProvider: ProviderName,
  fallbackModel: string,
) {
  const determineModel = (provider: ProviderName): string => {
    if (cli.model) {
      return cli.model;
    }

    if (provider === "anthropic") {
      return env.ANTHROPIC_MODEL ?? env.GLM_MODEL ?? fallbackModel;
    }

    if (provider === "openai-compatible") {
      return env.OPENAI_MODEL ?? env.GLM_MODEL ?? fallbackModel;
    }

    return env.GLM_MODEL ?? fallbackModel;
  };

  if (cli.provider) {
    return {
      provider: cli.provider,
      model: determineModel(cli.provider),
    };
  }

  if (env.ANTHROPIC_AUTH_TOKEN) {
    return {
      provider: "anthropic" as const,
      model: determineModel("anthropic"),
    };
  }

  if (env.OPENAI_API_KEY && env.OPENAI_MODEL) {
    return {
      provider: "openai-compatible" as const,
      model: determineModel("openai-compatible"),
    };
  }

  const envProvider = normalizeProviderName(env.GLM_PROVIDER);
  if (envProvider) {
    return {
      provider: envProvider,
      model: determineModel(envProvider),
    };
  }

  return {
    provider: fallbackProvider,
    model: determineModel(fallbackProvider),
  };
}
