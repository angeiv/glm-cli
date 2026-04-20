export type GlmPlatformRoute =
  | "native-bigmodel"
  | "native-zai"
  | "gateway-openrouter"
  | "gateway-modelscope-openai"
  | "gateway-other"
  | "unknown";

function normalizeHost(baseUrl: string): string | undefined {
  try {
    return new URL(baseUrl).hostname.trim().toLowerCase();
  } catch {
    return undefined;
  }
}

export function resolveGlmPlatformRoute(baseUrl?: string): GlmPlatformRoute {
  if (!baseUrl?.trim()) {
    return "unknown";
  }

  const host = normalizeHost(baseUrl);
  if (!host) {
    return "unknown";
  }

  if (host === "open.bigmodel.cn" || host.endsWith(".bigmodel.cn")) {
    return "native-bigmodel";
  }

  if (host === "api.z.ai" || host.endsWith(".z.ai")) {
    return "native-zai";
  }

  if (host === "openrouter.ai" || host.endsWith(".openrouter.ai")) {
    return "gateway-openrouter";
  }

  if (host === "api-inference.modelscope.cn") {
    return "gateway-modelscope-openai";
  }

  return "gateway-other";
}
