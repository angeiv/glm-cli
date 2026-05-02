import {
  getProviderCredentialSource,
  getProviderDefaultBaseUrl,
  isOfficialProvider,
  type ApiKind,
  type CredentialSource,
  type ProviderName,
} from "./types.js";

export type ProviderConfigLike = {
  apiKey?: string;
  baseURL?: string;
  api?: string;
};

export type ProviderSettings = {
  apiKey?: string;
  baseUrl: string;
  credentialSource: CredentialSource;
};

function normalizeNonEmpty(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveCredentialEnvKey(provider: ProviderName, api: ApiKind): string {
  const source = getProviderCredentialSource(provider, api);
  if (source === "anthropic") return "ANTHROPIC_AUTH_TOKEN";
  if (source === "openai") return "OPENAI_API_KEY";
  return "GLM_API_KEY";
}

function resolveBaseUrlEnvValue(
  provider: ProviderName,
  api: ApiKind,
  env: NodeJS.ProcessEnv,
): string | undefined {
  if (api === "anthropic") {
    return normalizeNonEmpty(env.ANTHROPIC_BASE_URL);
  }

  if (isOfficialProvider(provider)) {
    return normalizeNonEmpty(env.GLM_BASE_URL);
  }

  return normalizeNonEmpty(env.OPENAI_BASE_URL);
}

export function resolveProviderCredential(
  provider: ProviderName,
  api: ApiKind,
  env: NodeJS.ProcessEnv,
  persisted?: ProviderConfigLike,
): string | undefined {
  return normalizeNonEmpty(env[resolveCredentialEnvKey(provider, api)]) ?? normalizeNonEmpty(
    persisted?.apiKey,
  );
}

export function resolveProviderBaseUrl(
  provider: ProviderName,
  api: ApiKind,
  env: NodeJS.ProcessEnv,
  persisted?: ProviderConfigLike,
): string {
  return (
    resolveBaseUrlEnvValue(provider, api, env) ??
    normalizeNonEmpty(persisted?.baseURL) ??
    getProviderDefaultBaseUrl(provider, api)
  );
}

export function resolveProviderSettings(args: {
  provider: ProviderName;
  api: ApiKind;
  env: NodeJS.ProcessEnv;
  persisted?: ProviderConfigLike;
}): ProviderSettings {
  return {
    apiKey: resolveProviderCredential(args.provider, args.api, args.env, args.persisted),
    baseUrl: resolveProviderBaseUrl(args.provider, args.api, args.env, args.persisted),
    credentialSource: getProviderCredentialSource(args.provider, args.api),
  };
}
