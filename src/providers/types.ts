export const PROVIDER_NAMES = ["glm-official", "openai-compatible", "anthropic"] as const;

export type ProviderName = (typeof PROVIDER_NAMES)[number];

export function isProviderName(value?: string): value is ProviderName {
  return PROVIDER_NAMES.includes(value as ProviderName);
}

export function normalizeProviderName(value?: string): ProviderName | undefined {
  return isProviderName(value) ? value : undefined;
}
