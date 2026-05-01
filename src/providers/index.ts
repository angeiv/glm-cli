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
): { provider: ProviderName; model: string } {
  const determineModel = (provider: ProviderName): string => {
    if (cli.model) {
      return cli.model;
    }

    if (provider === "anthropic") {
      return env.ANTHROPIC_MODEL ?? env.GLM_MODEL ?? fallbackModel;
    }

    if (provider === "openai-compatible" || provider === "openai-responses") {
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

  const envGlmProvider = normalizeProviderName(env.GLM_PROVIDER);
  if (envGlmProvider) {
    return {
      provider: envGlmProvider,
      model: determineModel(envGlmProvider),
    };
  }

  if (env.ANTHROPIC_AUTH_TOKEN) {
    return {
      provider: "anthropic" as const,
      model: determineModel("anthropic"),
    };
  }

  if (env.OPENAI_API_KEY) {
    const openAiProvider =
      fallbackProvider === "openai-responses" ? "openai-responses" : "openai-compatible";
    return {
      provider: openAiProvider,
      model: determineModel(openAiProvider),
    };
  }

  return {
    provider: fallbackProvider,
    model: determineModel(fallbackProvider),
  };
}
