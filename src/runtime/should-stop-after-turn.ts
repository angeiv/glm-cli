import { appendRuntimeEvent } from "../diagnostics/event-log.js";

type AssistantLikeMessage = {
  role?: string;
  provider?: string;
  model?: string;
  stopReason?: string;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
  };
};

type ShouldStopForQueuedCompactionInput = {
  hasQueuedMessages: boolean;
  contextWindow: number;
  compactionEnabled: boolean;
  reserveTokens: number;
  message: AssistantLikeMessage;
};

type LoopConfigWithStopHook = {
  shouldStopAfterTurn?: (context: {
    message: AssistantLikeMessage;
    toolResults: unknown[];
    context: unknown;
    newMessages: unknown[];
  }) => boolean | Promise<boolean>;
};

type ShouldStopAfterTurnContextLike = {
  message: AssistantLikeMessage;
  toolResults: unknown[];
  context: unknown;
  newMessages: unknown[];
};

const SHOULD_STOP_AFTER_TURN_PATCHED = Symbol.for("glm.shouldStopAfterTurn.patched");

function calculateUsageTokens(message: AssistantLikeMessage): number | undefined {
  const usage = message.usage;
  if (!usage) return undefined;

  if (typeof usage.totalTokens === "number" && Number.isFinite(usage.totalTokens)) {
    return usage.totalTokens;
  }

  const parts = [usage.input, usage.output, usage.cacheRead, usage.cacheWrite].map((value) =>
    typeof value === "number" && Number.isFinite(value) ? value : 0,
  );
  const total = parts.reduce((sum, value) => sum + value, 0);
  return total > 0 ? total : undefined;
}

export function shouldStopForQueuedCompaction(input: ShouldStopForQueuedCompactionInput): boolean {
  if (!input.hasQueuedMessages || !input.compactionEnabled) {
    return false;
  }

  if (!Number.isFinite(input.contextWindow) || input.contextWindow <= 0) {
    return false;
  }

  if (input.message.role !== "assistant") {
    return false;
  }

  if (input.message.stopReason === "error" || input.message.stopReason === "aborted") {
    return false;
  }

  const totalTokens = calculateUsageTokens(input.message);
  if (totalTokens === undefined) {
    return false;
  }

  return totalTokens > input.contextWindow - input.reserveTokens;
}

export function installShouldStopAfterTurn(session: {
  agent?: unknown;
  settingsManager?: {
    getCompactionSettings?: () => {
      enabled: boolean;
      reserveTokens: number;
    };
  };
}): void {
  const agent = session.agent as
    | (Record<PropertyKey, unknown> & {
        state?: {
          model?: {
            provider?: string;
            id?: string;
            contextWindow?: number;
          };
        };
      })
    | undefined;
  if (!agent || typeof agent !== "object") {
    return;
  }

  if (agent[SHOULD_STOP_AFTER_TURN_PATCHED]) {
    return;
  }

  const createLoopConfig = agent.createLoopConfig;
  if (typeof createLoopConfig !== "function") {
    return;
  }

  const originalCreateLoopConfig = createLoopConfig.bind(agent) as (
    options?: unknown,
  ) => LoopConfigWithStopHook;
  agent.createLoopConfig = ((options?: unknown) => {
    const config = originalCreateLoopConfig(options);
    const originalShouldStopAfterTurn = config.shouldStopAfterTurn;

    return {
      ...config,
      shouldStopAfterTurn: async (context: ShouldStopAfterTurnContextLike) => {
        if ((await originalShouldStopAfterTurn?.(context)) === true) {
          return true;
        }

        const compaction = session.settingsManager?.getCompactionSettings?.();
        if (!compaction) {
          return false;
        }

        const hasQueuedMessages =
          typeof agent.hasQueuedMessages === "function" ? !!agent.hasQueuedMessages() : false;
        const model = agent.state?.model;
        const shouldStop = shouldStopForQueuedCompaction({
          hasQueuedMessages,
          contextWindow: model?.contextWindow ?? 0,
          compactionEnabled: compaction.enabled,
          reserveTokens: compaction.reserveTokens,
          message: context.message,
        });

        if (shouldStop) {
          const totalTokens = calculateUsageTokens(context.message);
          appendRuntimeEvent({
            type: "turn.stop_after_turn",
            summary: `stopped after turn before draining queued messages to allow compaction (${model?.provider ?? "unknown"}/${model?.id ?? "unknown"} | tokens=${totalTokens ?? "unknown"} | reserve=${compaction.reserveTokens})`,
            details: {
              model: {
                provider: model?.provider,
                id: model?.id,
                contextWindow: model?.contextWindow,
              },
              compaction: {
                enabled: compaction.enabled,
                reserveTokens: compaction.reserveTokens,
              },
              usage: context.message.usage ?? {},
            },
          });
        }

        return shouldStop;
      },
    };
  }) as typeof agent.createLoopConfig;

  agent[SHOULD_STOP_AFTER_TURN_PATCHED] = true;
}
