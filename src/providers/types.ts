export const PROVIDER_NAMES = [
  "bigmodel",
  "bigmodel-coding",
  "zai",
  "zai-coding",
  "bailian",
  "bailian-coding",
  "openrouter",
  "custom",
] as const;

export type ProviderName = (typeof PROVIDER_NAMES)[number];

export const API_KINDS = ["openai-compatible", "openai-responses", "anthropic"] as const;

export type ApiKind = (typeof API_KINDS)[number];

export type ProviderKind = "official" | "gateway" | "custom";
export type CredentialSource = "glm" | "openai" | "anthropic";

export type ProviderDefinition = {
  id: ProviderName;
  displayName: string;
  kind: ProviderKind;
  defaultApi: ApiKind;
  defaultBaseUrls: Record<ApiKind, string>;
  credentialSourceByApi: Record<ApiKind, CredentialSource>;
};

export type ProviderInput = {
  provider: ProviderName;
  apiHint?: ApiKind;
};

const PROVIDER_ALIASES: Record<string, ProviderInput> = {
  glm: { provider: "bigmodel-coding" },
  "glm-official": { provider: "bigmodel-coding" },
  "bigmodel-api": { provider: "bigmodel" },
  "open.bigmodel": { provider: "bigmodel" },
  "open.bigmodel.cn": { provider: "bigmodel" },
  "bigmodel-coding-plan": { provider: "bigmodel-coding" },
  "z.ai": { provider: "zai" },
  "z-ai": { provider: "zai" },
  "api.z.ai": { provider: "zai" },
  "zai-api": { provider: "zai" },
  "zai-coding-plan": { provider: "zai-coding" },
  dashscope: { provider: "bailian" },
  "openai-compatible": { provider: "custom", apiHint: "openai-compatible" },
  "openai-completions": { provider: "custom", apiHint: "openai-compatible" },
  "openai-responses": { provider: "custom", apiHint: "openai-responses" },
  anthropic: { provider: "custom", apiHint: "anthropic" },
  "anthropic-messages": { provider: "custom", apiHint: "anthropic" },
};

const API_ALIASES: Record<string, ApiKind> = {
  "openai-compatible": "openai-compatible",
  "openai-completions": "openai-compatible",
  "openai-responses": "openai-responses",
  anthropic: "anthropic",
  "anthropic-messages": "anthropic",
};

export const PROVIDER_DEFINITIONS: Record<ProviderName, ProviderDefinition> = {
  bigmodel: {
    id: "bigmodel",
    displayName: "BigModel",
    kind: "official",
    defaultApi: "openai-compatible",
    defaultBaseUrls: {
      "openai-compatible": "https://open.bigmodel.cn/api/paas/v4/",
      "openai-responses": "https://open.bigmodel.cn/api/paas/v4/",
      anthropic: "https://open.bigmodel.cn/api/anthropic",
    },
    credentialSourceByApi: {
      "openai-compatible": "glm",
      "openai-responses": "glm",
      anthropic: "anthropic",
    },
  },
  "bigmodel-coding": {
    id: "bigmodel-coding",
    displayName: "BigModel Coding",
    kind: "official",
    defaultApi: "openai-compatible",
    defaultBaseUrls: {
      "openai-compatible": "https://open.bigmodel.cn/api/coding/paas/v4/",
      "openai-responses": "https://open.bigmodel.cn/api/coding/paas/v4/",
      anthropic: "https://open.bigmodel.cn/api/coding/anthropic",
    },
    credentialSourceByApi: {
      "openai-compatible": "glm",
      "openai-responses": "glm",
      anthropic: "anthropic",
    },
  },
  zai: {
    id: "zai",
    displayName: "Z.ai",
    kind: "official",
    defaultApi: "openai-compatible",
    defaultBaseUrls: {
      "openai-compatible": "https://api.z.ai/api/paas/v4/",
      "openai-responses": "https://api.z.ai/api/paas/v4/",
      anthropic: "https://api.z.ai/api/anthropic",
    },
    credentialSourceByApi: {
      "openai-compatible": "glm",
      "openai-responses": "glm",
      anthropic: "anthropic",
    },
  },
  "zai-coding": {
    id: "zai-coding",
    displayName: "Z.ai Coding",
    kind: "official",
    defaultApi: "openai-compatible",
    defaultBaseUrls: {
      "openai-compatible": "https://api.z.ai/api/coding/paas/v4/",
      "openai-responses": "https://api.z.ai/api/coding/paas/v4/",
      anthropic: "https://api.z.ai/api/coding/anthropic",
    },
    credentialSourceByApi: {
      "openai-compatible": "glm",
      "openai-responses": "glm",
      anthropic: "anthropic",
    },
  },
  bailian: {
    id: "bailian",
    displayName: "Aliyun Bailian",
    kind: "gateway",
    defaultApi: "openai-compatible",
    defaultBaseUrls: {
      "openai-compatible": "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "openai-responses": "https://dashscope.aliyuncs.com/compatible-mode/v1",
      anthropic: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
    credentialSourceByApi: {
      "openai-compatible": "openai",
      "openai-responses": "openai",
      anthropic: "anthropic",
    },
  },
  "bailian-coding": {
    id: "bailian-coding",
    displayName: "Aliyun Bailian Coding",
    kind: "gateway",
    defaultApi: "openai-compatible",
    defaultBaseUrls: {
      "openai-compatible": "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "openai-responses": "https://dashscope.aliyuncs.com/compatible-mode/v1",
      anthropic: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
    credentialSourceByApi: {
      "openai-compatible": "openai",
      "openai-responses": "openai",
      anthropic: "anthropic",
    },
  },
  openrouter: {
    id: "openrouter",
    displayName: "OpenRouter",
    kind: "gateway",
    defaultApi: "openai-compatible",
    defaultBaseUrls: {
      "openai-compatible": "https://openrouter.ai/api/v1",
      "openai-responses": "https://openrouter.ai/api/v1",
      anthropic: "https://openrouter.ai/api/v1",
    },
    credentialSourceByApi: {
      "openai-compatible": "openai",
      "openai-responses": "openai",
      anthropic: "anthropic",
    },
  },
  custom: {
    id: "custom",
    displayName: "Custom",
    kind: "custom",
    defaultApi: "openai-compatible",
    defaultBaseUrls: {
      "openai-compatible": "https://api.openai.com/v1",
      "openai-responses": "https://api.openai.com/v1",
      anthropic: "https://api.anthropic.com/v1",
    },
    credentialSourceByApi: {
      "openai-compatible": "openai",
      "openai-responses": "openai",
      anthropic: "anthropic",
    },
  },
};

function normalize(value?: string): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}

export function isProviderName(value?: string): value is ProviderName {
  return PROVIDER_NAMES.includes(value as ProviderName);
}

export function isApiKind(value?: string): value is ApiKind {
  return API_KINDS.includes(value as ApiKind);
}

export function normalizeApiKind(value?: string): ApiKind | undefined {
  const normalized = normalize(value);
  if (!normalized) return undefined;
  return API_ALIASES[normalized];
}

export function resolveProviderInput(value?: string): ProviderInput | undefined {
  const normalized = normalize(value);
  if (!normalized) return undefined;

  const alias = PROVIDER_ALIASES[normalized];
  if (alias) {
    return alias;
  }

  if (isProviderName(normalized)) {
    return { provider: normalized };
  }

  return undefined;
}

export function normalizeProviderName(value?: string): ProviderName | undefined {
  return resolveProviderInput(value)?.provider;
}

function resolveCanonicalProviderName(value: string): ProviderName {
  return resolveProviderInput(value)?.provider ?? (value as ProviderName);
}

export function getProviderDefinition(provider: ProviderName | string): ProviderDefinition {
  return PROVIDER_DEFINITIONS[resolveCanonicalProviderName(provider)];
}

export function getProviderDisplayName(provider: ProviderName | string): string {
  return getProviderDefinition(provider).displayName;
}

export function getProviderDefaultApi(provider: ProviderName | string): ApiKind {
  return getProviderDefinition(provider).defaultApi;
}

export function getProviderDefaultBaseUrl(provider: ProviderName | string, api: ApiKind): string {
  return getProviderDefinition(provider).defaultBaseUrls[api];
}

export function getProviderCredentialSource(
  provider: ProviderName | string,
  api: ApiKind,
): CredentialSource {
  return getProviderDefinition(provider).credentialSourceByApi[api];
}

export function isOfficialProvider(provider: ProviderName | string): boolean {
  return getProviderDefinition(provider).kind === "official";
}
