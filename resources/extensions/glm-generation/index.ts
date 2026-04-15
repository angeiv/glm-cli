import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type GenerationOverrides = {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
};

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : undefined;
}

export function resolveGenerationOverrides(env: NodeJS.ProcessEnv): GenerationOverrides {
  const maxOutputTokens = parseNumber(env.GLM_MAX_OUTPUT_TOKENS);
  const temperature = parseNumber(env.GLM_TEMPERATURE);
  const topP = parseNumber(env.GLM_TOP_P);

  return {
    maxOutputTokens: maxOutputTokens === undefined ? undefined : Math.floor(maxOutputTokens),
    temperature,
    topP,
  };
}

export function applyGenerationOverrides(
  payload: unknown,
  overrides: GenerationOverrides,
  model?: { maxTokens?: number },
): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const next = { ...(payload as Record<string, unknown>) };

  if (overrides.maxOutputTokens !== undefined) {
    const max = model?.maxTokens && Number.isFinite(model.maxTokens) ? model.maxTokens : undefined;
    const clamped =
      max === undefined ? overrides.maxOutputTokens : Math.min(overrides.maxOutputTokens, max);
    next.max_tokens = clamped;
  }

  if (overrides.temperature !== undefined) {
    next.temperature = overrides.temperature;
  }

  if (overrides.topP !== undefined) {
    next.top_p = overrides.topP;
  }

  return next;
}

export default function (pi: ExtensionAPI) {
  const overrides = resolveGenerationOverrides(process.env);

  const hasOverrides =
    overrides.maxOutputTokens !== undefined ||
    overrides.temperature !== undefined ||
    overrides.topP !== undefined;

  if (!hasOverrides) {
    return;
  }

  pi.on("before_provider_request", (event, ctx) => {
    return applyGenerationOverrides(event.payload, overrides, ctx.model as any);
  });
}

