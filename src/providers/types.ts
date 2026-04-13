export const PROVIDER_NAMES = ["glm", "openai-compatible", "anthropic"] as const;

export type ProviderName = (typeof PROVIDER_NAMES)[number];

export function isProviderName(value?: string): value is ProviderName {
  return PROVIDER_NAMES.includes(value as ProviderName);
}

export function normalizeProviderName(value?: string): ProviderName | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // Backwards compatibility: treat legacy provider name as alias.
  if (trimmed === "glm-official") {
    return "glm";
  }

  return isProviderName(trimmed) ? trimmed : undefined;
}
