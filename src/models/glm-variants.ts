import type { EffectiveModelCaps } from "./glm-catalog.js";
import type { GlmPlatformRoute } from "./glm-platforms.js";

export type GlmUpstreamVendor = "z-ai" | "fireworks" | "unknown";

export type VariantOverlay = {
  upstreamVendor: GlmUpstreamVendor;
  caps: Partial<EffectiveModelCaps>;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveGlmUpstreamVendor(
  platform: GlmPlatformRoute,
  modelId: string,
): GlmUpstreamVendor {
  if (platform !== "gateway-openrouter") {
    return "unknown";
  }

  const normalized = normalize(modelId);
  if (
    normalized.startsWith("z-ai/") ||
    normalized.startsWith("zai/") ||
    normalized.startsWith("zai-org/")
  ) {
    return "z-ai";
  }

  if (normalized.includes("fireworks")) {
    return "fireworks";
  }

  return "unknown";
}

export function resolveVariantOverlay(
  platform: GlmPlatformRoute,
  modelId: string,
  canonicalModelId?: string,
): VariantOverlay {
  const upstreamVendor = resolveGlmUpstreamVendor(platform, modelId);

  if (
    platform === "gateway-openrouter" &&
    upstreamVendor === "z-ai" &&
    canonicalModelId === "glm-5.1"
  ) {
    return {
      upstreamVendor,
      caps: {
        contextWindow: 202_752,
      },
    };
  }

  if (
    platform === "gateway-openrouter" &&
    upstreamVendor === "fireworks" &&
    canonicalModelId === "glm-5"
  ) {
    return {
      upstreamVendor,
      caps: {
        contextWindow: 202_800,
        supportsToolCall: false,
        supportsToolStream: false,
      },
    };
  }

  return {
    upstreamVendor,
    caps: {},
  };
}
