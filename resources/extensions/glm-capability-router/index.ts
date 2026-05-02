import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  resolveCapabilityRouteDecision,
  type VisionFallbackConfig,
} from "../shared/glm-profile.js";
import { readGlmModelRoutingConfig } from "../shared/glm-user-config.js";
import { appendRuntimeEvent } from "../shared/runtime-state.js";

type RoutingModelInfo = {
  provider?: string;
  id?: string;
  input?: string[];
};

type RoutingTarget = {
  provider: string;
  model: string;
};

const ROUTING_STATUS_KEY = "glm.routing";
const ROUTING_STATE = Symbol.for("glm.capabilityRouter");

function normalizeMode(value: string | undefined): "off" | "suggest" | "route" | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "off" || normalized === "suggest" || normalized === "route") {
    return normalized;
  }
  return undefined;
}

function normalizeProvider(
  value: string | undefined,
): "glm" | "openai-compatible" | "openai-responses" | "anthropic" | undefined {
  const normalized = value?.trim();
  if (
    normalized === "glm" ||
    normalized === "openai-compatible" ||
    normalized === "openai-responses" ||
    normalized === "anthropic"
  ) {
    return normalized;
  }
  return undefined;
}

function normalizeModel(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readVisionFallbackConfig(): VisionFallbackConfig {
  const fileConfig = readGlmModelRoutingConfig()?.visionFallback;
  const mode = normalizeMode(process.env.GLM_VISION_FALLBACK_MODE) ?? fileConfig?.mode ?? "suggest";
  const provider =
    normalizeProvider(process.env.GLM_VISION_FALLBACK_PROVIDER) ?? fileConfig?.provider;
  const model = normalizeModel(process.env.GLM_VISION_FALLBACK_MODEL) ?? fileConfig?.model;

  return {
    mode,
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
  };
}

function formatTarget(target?: RoutingTarget): string | undefined {
  if (!target) return undefined;
  return `${target.provider}/${target.model}`;
}

function formatRoutingStatus(config: VisionFallbackConfig): string | undefined {
  const mode = config.mode ?? "suggest";
  if (mode === "off") {
    return undefined;
  }

  const target =
    config.provider && config.model
      ? {
          provider: config.provider,
          model: config.model,
        }
      : undefined;

  return target
    ? `vision fallback: ${mode} -> ${formatTarget(target)}`
    : `vision fallback: ${mode}`;
}

function setStatus(
  ctx: { hasUI?: boolean; ui?: { setStatus?: (key: string, text: string | undefined) => void } },
  config: VisionFallbackConfig,
): void {
  if (!ctx.hasUI) return;
  ctx.ui?.setStatus?.(ROUTING_STATUS_KEY, formatRoutingStatus(config));
}

function getRequestedModalities(event: {
  text?: string;
  images?: Array<unknown>;
}): Array<"text" | "image"> {
  const requested = new Set<"text" | "image">();
  if (typeof event.text === "string" && event.text.trim()) {
    requested.add("text");
  }
  if (Array.isArray(event.images) && event.images.length > 0) {
    requested.add("image");
  }
  return [...requested];
}

function getStateStore(): { lastSignature?: string } {
  const root = globalThis as Record<PropertyKey, unknown>;
  const existing = root[ROUTING_STATE];
  if (existing && typeof existing === "object") {
    return existing as { lastSignature?: string };
  }

  const next: { lastSignature?: string } = {};
  root[ROUTING_STATE] = next;
  return next;
}

function buildSignature(args: {
  provider?: string;
  model?: string;
  text?: string;
  imageCount: number;
  action: string;
  target?: RoutingTarget;
}): string {
  return JSON.stringify({
    provider: args.provider ?? "",
    model: args.model ?? "",
    text: args.text ?? "",
    imageCount: args.imageCount,
    action: args.action,
    target: args.target ? `${args.target.provider}/${args.target.model}` : "",
  });
}

function shouldNotify(signature: string): boolean {
  const store = getStateStore();
  if (store.lastSignature === signature) {
    return false;
  }
  store.lastSignature = signature;
  return true;
}

function targetFromConfig(config: VisionFallbackConfig): RoutingTarget | undefined {
  if (!config.provider || !config.model) {
    return undefined;
  }

  return {
    provider: config.provider,
    model: config.model,
  };
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    setStatus(ctx, readVisionFallbackConfig());
  });

  pi.on("model_select", (_event, ctx) => {
    setStatus(ctx, readVisionFallbackConfig());
  });

  pi.on("input", async (event, ctx) => {
    const currentModel = ctx.model as RoutingModelInfo | undefined;
    if (!currentModel?.provider || !currentModel?.id) {
      return { action: "continue" as const };
    }

    const config = readVisionFallbackConfig();
    setStatus(ctx, config);

    const requestedModalities = getRequestedModalities(event);
    if (!requestedModalities.includes("image")) {
      return { action: "continue" as const };
    }

    const decision = resolveCapabilityRouteDecision({
      requestedModalities,
      supportedModalities: (currentModel.input as
        | Array<"text" | "image" | "video">
        | undefined) ?? ["text"],
      current: {
        provider: currentModel.provider,
        model: currentModel.id,
      },
      visionFallback: config,
    });

    if (decision.action === "none") {
      return { action: "continue" as const };
    }

    const signature = buildSignature({
      provider: currentModel.provider,
      model: currentModel.id,
      text: event.text,
      imageCount: event.images?.length ?? 0,
      action: decision.action,
      target: "target" in decision ? decision.target : undefined,
    });

    if (decision.action === "suggest") {
      appendRuntimeEvent({
        type: "capability.suggest",
        summary: decision.target
          ? `image input suggested fallback ${formatTarget(decision.target)}`
          : "image input requested on a text-only model",
        details: {
          current: { provider: currentModel.provider, model: currentModel.id },
          ...(decision.target ? { target: decision.target } : {}),
          missingModalities: decision.missingModalities,
        },
      });

      if (ctx.hasUI && shouldNotify(`${signature}:suggest`)) {
        const suffix = decision.target
          ? ` Suggested fallback: ${formatTarget(decision.target)}.`
          : "";
        ctx.ui?.notify?.(`Current model does not support image input.${suffix}`, "warning");
      }

      return { action: "continue" as const };
    }

    if (decision.action === "blocked") {
      appendRuntimeEvent({
        type: "capability.blocked",
        level: "warn",
        summary: decision.reason,
        details: {
          current: { provider: currentModel.provider, model: currentModel.id },
          missingModalities: decision.missingModalities,
        },
      });

      if (ctx.hasUI && shouldNotify(`${signature}:blocked`)) {
        const configuredTarget = formatTarget(targetFromConfig(config));
        const message =
          configuredTarget && config.mode === "route"
            ? `Image input requires a configured vision fallback model, but ${configuredTarget} is unavailable or does not support images.`
            : `Current model does not support ${decision.missingModalities.join(", ")} input.`;
        ctx.ui?.notify?.(message, "error");
      }

      return { action: "continue" as const };
    }

    const targetModel = ctx.modelRegistry.find(decision.target.provider, decision.target.model);
    const supportsImage = targetModel?.input?.includes("image");
    if (!targetModel || !supportsImage) {
      appendRuntimeEvent({
        type: "capability.blocked",
        level: "warn",
        summary: `configured vision fallback unavailable: ${formatTarget(decision.target)}`,
        details: {
          current: { provider: currentModel.provider, model: currentModel.id },
          target: decision.target,
        },
      });

      if (ctx.hasUI && shouldNotify(`${signature}:missing-target`)) {
        ctx.ui?.notify?.(
          `Image input requires a configured vision fallback model, but ${formatTarget(decision.target)} is unavailable or does not support images.`,
          "error",
        );
      }

      return { action: "continue" as const };
    }

    const switched = await pi.setModel(targetModel);
    if (!switched) {
      appendRuntimeEvent({
        type: "capability.blocked",
        level: "warn",
        summary: `vision fallback auth/config unavailable for ${formatTarget(decision.target)}`,
        details: {
          current: { provider: currentModel.provider, model: currentModel.id },
          target: decision.target,
        },
      });

      if (ctx.hasUI && shouldNotify(`${signature}:auth`)) {
        ctx.ui?.notify?.(
          `Unable to switch to vision fallback model ${formatTarget(decision.target)} because it is not fully configured.`,
          "error",
        );
      }

      return { action: "continue" as const };
    }

    appendRuntimeEvent({
      type: "capability.route",
      summary: `routed image input to ${formatTarget(decision.target)}`,
      details: {
        previous: { provider: currentModel.provider, model: currentModel.id },
        target: decision.target,
        missingModalities: decision.missingModalities,
      },
    });

    if (ctx.hasUI && shouldNotify(`${signature}:route`)) {
      ctx.ui?.notify?.(
        `Switched to vision fallback model ${formatTarget(decision.target)} for this request.`,
        "info",
      );
    }

    return { action: "continue" as const };
  });
}
