import type { ProviderName } from "./types.js";

type ResolveProviderArgs = {
  provider?: ProviderName;
  model?: string;
};

export function resolveProviderSelection(cli: ResolveProviderArgs, env: NodeJS.ProcessEnv) {
  if (cli.provider) {
    return {
      provider: cli.provider,
      model: cli.model ?? env.GLM_MODEL ?? "glm-5",
    };
  }

  if (env.ANTHROPIC_AUTH_TOKEN) {
    return {
      provider: "anthropic" as const,
      model: cli.model ?? env.ANTHROPIC_MODEL ?? "glm-5",
    };
  }

  if (env.OPENAI_API_KEY && env.OPENAI_MODEL) {
    return {
      provider: "openai-compatible" as const,
      model: cli.model ?? env.OPENAI_MODEL ?? "glm-5",
    };
  }

  return {
    provider: "glm-official" as const,
    model: cli.model ?? env.GLM_MODEL ?? "glm-5",
  };
}
