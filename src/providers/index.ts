import type { ApiKind, ProviderName } from "./types.js";
import {
  getProviderCredentialSource,
  getProviderDefaultApi,
  normalizeApiKind,
  resolveProviderInput,
} from "./types.js";

type ResolveProviderArgs = {
  provider?: ProviderName;
  api?: ApiKind;
  model?: string;
};

export type ResolvedProviderSelection = {
  provider: ProviderName;
  api: ApiKind;
  model: string;
};

function determineModel(args: {
  model?: string;
  provider: ProviderName;
  api: ApiKind;
  env: NodeJS.ProcessEnv;
  fallbackModel: string;
}): string {
  if (args.model) {
    return args.model;
  }

  if (args.api === "anthropic") {
    return args.env.ANTHROPIC_MODEL ?? args.env.GLM_MODEL ?? args.fallbackModel;
  }

  const credentialSource = getProviderCredentialSource(args.provider, args.api);
  if (credentialSource === "glm") {
    return args.env.GLM_MODEL ?? args.env.OPENAI_MODEL ?? args.fallbackModel;
  }

  return args.env.OPENAI_MODEL ?? args.env.GLM_MODEL ?? args.fallbackModel;
}

function resolveFallbackApi(
  fallbackProvider: ProviderName,
  fallbackApi?: ApiKind,
  cliApi?: ApiKind,
  envApi?: ApiKind,
  providerApiHint?: ApiKind,
): ApiKind {
  return (
    cliApi ?? envApi ?? providerApiHint ?? fallbackApi ?? getProviderDefaultApi(fallbackProvider)
  );
}

export function resolveProviderSelection(
  cli: ResolveProviderArgs,
  env: NodeJS.ProcessEnv,
  fallbackProvider: ProviderName,
  fallbackModel: string,
  fallbackApi?: ApiKind,
): ResolvedProviderSelection {
  const envProviderInput = resolveProviderInput(env.GLM_PROVIDER);
  const cliApi = cli.api;
  const envApi = normalizeApiKind(env.GLM_API);

  if (cli.provider) {
    const api = resolveFallbackApi(fallbackProvider, fallbackApi, cliApi, envApi);
    return {
      provider: cli.provider,
      api,
      model: determineModel({
        model: cli.model,
        provider: cli.provider,
        api,
        env,
        fallbackModel,
      }),
    };
  }

  if (envProviderInput) {
    const api = resolveFallbackApi(
      envProviderInput.provider,
      fallbackApi,
      cliApi,
      envApi,
      envProviderInput.apiHint,
    );
    return {
      provider: envProviderInput.provider,
      api,
      model: determineModel({
        model: cli.model,
        provider: envProviderInput.provider,
        api,
        env,
        fallbackModel,
      }),
    };
  }

  if (env.ANTHROPIC_AUTH_TOKEN?.trim()) {
    const provider = "custom";
    const api = resolveFallbackApi(provider, fallbackApi, cliApi, envApi, "anthropic");
    return {
      provider,
      api,
      model: determineModel({
        model: cli.model,
        provider,
        api,
        env,
        fallbackModel,
      }),
    };
  }

  if (env.OPENAI_API_KEY?.trim()) {
    const provider =
      getProviderCredentialSource(
        fallbackProvider,
        fallbackApi ?? getProviderDefaultApi(fallbackProvider),
      ) === "openai"
        ? fallbackProvider
        : "custom";
    const api = resolveFallbackApi(provider, fallbackApi, cliApi, envApi);
    return {
      provider,
      api,
      model: determineModel({
        model: cli.model,
        provider,
        api,
        env,
        fallbackModel,
      }),
    };
  }

  const provider = fallbackProvider;
  const api = resolveFallbackApi(provider, fallbackApi, cliApi, envApi);
  return {
    provider,
    api,
    model: determineModel({
      model: cli.model,
      provider,
      api,
      env,
      fallbackModel,
    }),
  };
}
