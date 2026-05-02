import type { GlmPlatformRoute, GlmUpstreamVendor } from "./model-profile-types.js";

export type ModelGatewayAdapter = {
  id: Exclude<GlmPlatformRoute, "unknown">;
  providerAliases: string[];
  matchesHost: (host: string) => boolean;
};

const MODEL_GATEWAY_ADAPTERS: ModelGatewayAdapter[] = [
  {
    id: "native-bigmodel",
    providerAliases: ["bigmodel", "bigmodel-coding", "glm"],
    matchesHost: (host) => host === "open.bigmodel.cn" || host.endsWith(".bigmodel.cn"),
  },
  {
    id: "native-zai",
    providerAliases: ["zai", "zai-coding", "z.ai", "z-ai"],
    matchesHost: (host) => host === "api.z.ai" || host.endsWith(".z.ai"),
  },
  {
    id: "gateway-openrouter",
    providerAliases: ["openrouter"],
    matchesHost: (host) => host === "openrouter.ai" || host.endsWith(".openrouter.ai"),
  },
  {
    id: "gateway-modelscope-openai",
    providerAliases: ["modelscope"],
    matchesHost: (host) => host === "api-inference.modelscope.cn",
  },
  {
    id: "gateway-dashscope",
    providerAliases: ["bailian", "bailian-coding", "dashscope"],
    matchesHost: (host) => host === "dashscope.aliyuncs.com" || host === "bailian.aliyuncs.com",
  },
  {
    id: "gateway-other",
    providerAliases: ["other"],
    matchesHost: () => true,
  },
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function listModelGateways(): ModelGatewayAdapter[] {
  return [...MODEL_GATEWAY_ADAPTERS];
}

export function resolveExplicitGateway(
  provider?: string,
): Exclude<GlmPlatformRoute, "unknown"> | undefined {
  if (!provider?.trim()) {
    return undefined;
  }

  const normalizedProvider = normalize(provider);
  return MODEL_GATEWAY_ADAPTERS.find((adapter) =>
    adapter.providerAliases.includes(normalizedProvider),
  )?.id;
}

export function resolveModelGatewayRoute(
  providerOrBaseUrl?: string,
  maybeBaseUrl?: string,
): GlmPlatformRoute {
  const provider =
    providerOrBaseUrl && providerOrBaseUrl.includes("://") ? maybeBaseUrl : providerOrBaseUrl;
  const baseUrl =
    providerOrBaseUrl && providerOrBaseUrl.includes("://") ? providerOrBaseUrl : maybeBaseUrl;
  const explicitGateway = resolveExplicitGateway(provider);
  if (explicitGateway) {
    return explicitGateway;
  }

  if (!baseUrl?.trim()) {
    return "unknown";
  }

  let host: string | undefined;
  try {
    host = new URL(baseUrl).hostname.trim().toLowerCase();
  } catch {
    return "unknown";
  }

  return (
    MODEL_GATEWAY_ADAPTERS.find(
      (adapter) => adapter.id !== "gateway-other" && adapter.matchesHost(host),
    )?.id ?? "gateway-other"
  );
}

export function resolveGatewayUpstreamVendor(
  gateway: GlmPlatformRoute,
  modelId: string,
): GlmUpstreamVendor {
  if (gateway !== "gateway-openrouter") {
    return "unknown";
  }

  const normalizedModelId = modelId.trim().toLowerCase();
  if (
    normalizedModelId.startsWith("z-ai/") ||
    normalizedModelId.startsWith("zai/") ||
    normalizedModelId.startsWith("zai-org/")
  ) {
    return "z-ai";
  }

  if (normalizedModelId.includes("fireworks")) {
    return "fireworks";
  }

  return "unknown";
}
