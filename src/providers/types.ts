export const PROVIDER_NAMES = ["glm", "openai-compatible", "openai-responses", "anthropic"] as const;

export type ProviderName = (typeof PROVIDER_NAMES)[number];

export function isProviderName(value?: string): value is ProviderName {
  return PROVIDER_NAMES.includes(value as ProviderName);
}

export function normalizeProviderName(value?: string): ProviderName | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  return isProviderName(trimmed) ? trimmed : undefined;
}
