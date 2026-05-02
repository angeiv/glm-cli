import type { Message } from "@mariozechner/pi-ai";
import type { GlmInputModality } from "./model-profile-types.js";

export type CapabilityRouteMode = "off" | "suggest" | "route";

export type CapabilityRouteTarget = {
  provider: string;
  model: string;
};

export type VisionFallbackConfig = {
  mode?: CapabilityRouteMode;
  provider?: string;
  model?: string;
};

export type CapabilityRouteDecision =
  | { action: "none" }
  | {
      action: "suggest";
      missingModalities: GlmInputModality[];
      target?: CapabilityRouteTarget;
      reason: string;
    }
  | {
      action: "route";
      missingModalities: GlmInputModality[];
      target: CapabilityRouteTarget;
      reason: string;
    }
  | {
      action: "blocked";
      missingModalities: GlmInputModality[];
      reason: string;
    };

function uniqueModalities(values: GlmInputModality[]): GlmInputModality[] {
  const seen = new Set<GlmInputModality>();
  const next: GlmInputModality[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    next.push(value);
  }
  return next;
}

export function collectRequestedModalities(messages: Message[]): GlmInputModality[] {
  const latest = messages[messages.length - 1];
  if (!latest) return [];

  const modalities: GlmInputModality[] = [];
  const content = Array.isArray(latest.content)
    ? latest.content
    : typeof latest.content === "string"
      ? [{ type: "text", text: latest.content }]
      : [];

  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    if (part.type === "image") {
      modalities.push("image");
      continue;
    }
    if (part.type === "text") {
      modalities.push("text");
    }
  }

  return uniqueModalities(modalities);
}

export function resolveCapabilityRouteDecision(args: {
  requestedModalities: GlmInputModality[];
  supportedModalities: GlmInputModality[];
  current: CapabilityRouteTarget;
  visionFallback?: VisionFallbackConfig;
}): CapabilityRouteDecision {
  const requested = uniqueModalities(args.requestedModalities);
  if (requested.length === 0) {
    return { action: "none" };
  }

  const supported = new Set(args.supportedModalities);
  const missingModalities = requested.filter((modality) => !supported.has(modality));
  if (missingModalities.length === 0) {
    return { action: "none" };
  }

  const missingVision = missingModalities.includes("image");
  if (!missingVision) {
    return {
      action: "blocked",
      missingModalities,
      reason: `current model does not support ${missingModalities.join(", ")} input`,
    };
  }

  const fallback = args.visionFallback;
  const mode = fallback?.mode ?? "suggest";
  if (mode === "off") {
    return { action: "none" };
  }

  const target =
    fallback?.provider && fallback?.model
      ? {
          provider: fallback.provider,
          model: fallback.model,
        }
      : undefined;

  const reason = "current model does not support image input";
  if (mode === "route") {
    if (!target) {
      return {
        action: "blocked",
        missingModalities,
        reason: "image input requires a configured vision fallback model",
      };
    }

    if (target.provider === args.current.provider && target.model === args.current.model) {
      return {
        action: "blocked",
        missingModalities,
        reason:
          "configured vision fallback matches the current model but image input is unsupported",
      };
    }

    return {
      action: "route",
      missingModalities,
      target,
      reason,
    };
  }

  return {
    action: "suggest",
    missingModalities,
    ...(target ? { target } : {}),
    reason,
  };
}
