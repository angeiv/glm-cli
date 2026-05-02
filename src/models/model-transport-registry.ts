import type {
  EffectiveModelCaps,
  GlmInputModality,
  RuntimeTransport,
} from "./model-profile-types.js";
import {
  getGenericAnthropicCompatibleCaps,
  getGenericOpenAiCompatibleCaps,
  getGenericOpenAiCompatibleModalities,
} from "./model-family-registry.js";

export type ModelTransportAdapter = {
  id: RuntimeTransport;
  apiAliases: string[];
  getGenericCaps: () => EffectiveModelCaps;
  getGenericModalities: () => GlmInputModality[];
};

const DEFAULT_GENERIC_MODALITIES = (): GlmInputModality[] => getGenericOpenAiCompatibleModalities();

const MODEL_TRANSPORT_ADAPTERS: ModelTransportAdapter[] = [
  {
    id: "openai-completions",
    apiAliases: ["openai-compatible", "openai-completions", "openai"],
    getGenericCaps: () => getGenericOpenAiCompatibleCaps(),
    getGenericModalities: DEFAULT_GENERIC_MODALITIES,
  },
  {
    id: "openai-responses",
    apiAliases: ["openai-responses"],
    getGenericCaps: () => getGenericOpenAiCompatibleCaps(),
    getGenericModalities: DEFAULT_GENERIC_MODALITIES,
  },
  {
    id: "anthropic-messages",
    apiAliases: ["anthropic", "anthropic-messages"],
    getGenericCaps: () => getGenericAnthropicCompatibleCaps(),
    getGenericModalities: DEFAULT_GENERIC_MODALITIES,
  },
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function listModelTransports(): ModelTransportAdapter[] {
  return [...MODEL_TRANSPORT_ADAPTERS];
}

export function getModelTransportAdapter(
  transport: RuntimeTransport,
): ModelTransportAdapter | undefined {
  return MODEL_TRANSPORT_ADAPTERS.find((adapter) => adapter.id === transport);
}

export function resolveModelTransport(api?: string): RuntimeTransport {
  const normalizedApi = api ? normalize(api) : "openai-compatible";
  return (
    MODEL_TRANSPORT_ADAPTERS.find((adapter) => adapter.apiAliases.includes(normalizedApi))?.id ??
    "openai-completions"
  );
}

export function getTransportGenericCaps(transport: RuntimeTransport): EffectiveModelCaps {
  return (getModelTransportAdapter(transport) ?? MODEL_TRANSPORT_ADAPTERS[0]).getGenericCaps();
}

export function getTransportGenericModalities(transport: RuntimeTransport): GlmInputModality[] {
  return (
    getModelTransportAdapter(transport) ?? MODEL_TRANSPORT_ADAPTERS[0]
  ).getGenericModalities();
}
