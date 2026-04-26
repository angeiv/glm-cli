import type { RuntimeStatus } from "../diagnostics/types.js";

export const GLM_SESSION_ENV_ENTRY = "glm.session.env" as const;

export type SessionStartReason =
  | "startup"
  | "resume"
  | "new"
  | "fork"
  | "reload"
  | "unknown";

export type GlmSessionEnvSnapshot = {
  version: 1;
  recordedAt: string;
  reason: SessionStartReason;
  provider: string;
  model: string;
  baseUrl?: string;
  approvalPolicy: string;
  resolvedModel: {
    canonicalModelId?: string;
    platform: string;
    upstreamVendor: string;
    payloadPatchPolicy: string;
    confidence: string;
    contextWindow: number;
    maxOutputTokens: number;
  };
  toolSignature: {
    hash: string;
    builtinCount: number;
    customCount: number;
    mcpServerCount: number;
  };
  loop: {
    enabled: boolean;
    profile: string;
    maxRounds: number;
    maxToolCalls?: number;
    maxVerifyRuns?: number;
    failureMode: string;
    autoVerify: boolean;
    verifyCommand?: string;
    verifyFallbackCommand?: string;
  };
  compaction: {
    enabled: boolean;
    reserveTokens: number;
    keepRecentTokens: number;
  };
};

type MaybeCustomEntry = {
  type?: string;
  customType?: string;
  data?: unknown;
};

function isGlmSessionEnvSnapshot(value: unknown): value is GlmSessionEnvSnapshot {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<GlmSessionEnvSnapshot>;
  if (maybe.version !== 1) return false;
  if (typeof maybe.recordedAt !== "string") return false;
  if (typeof maybe.provider !== "string") return false;
  if (typeof maybe.model !== "string") return false;
  if (typeof maybe.approvalPolicy !== "string") return false;
  if (!maybe.resolvedModel || typeof maybe.resolvedModel !== "object") return false;
  if (typeof maybe.resolvedModel.platform !== "string") return false;
  if (typeof maybe.resolvedModel.upstreamVendor !== "string") return false;
  if (typeof maybe.resolvedModel.payloadPatchPolicy !== "string") return false;
  if (typeof maybe.resolvedModel.confidence !== "string") return false;
  if (typeof maybe.resolvedModel.contextWindow !== "number") return false;
  if (typeof maybe.resolvedModel.maxOutputTokens !== "number") return false;
  if (!maybe.toolSignature || typeof maybe.toolSignature !== "object") return false;
  if (typeof maybe.toolSignature.hash !== "string") return false;
  if (typeof maybe.toolSignature.builtinCount !== "number") return false;
  if (typeof maybe.toolSignature.customCount !== "number") return false;
  if (typeof maybe.toolSignature.mcpServerCount !== "number") return false;
  if (!maybe.loop || typeof maybe.loop !== "object") return false;
  if (typeof maybe.loop.enabled !== "boolean") return false;
  if (typeof maybe.loop.profile !== "string") return false;
  if (typeof maybe.loop.maxRounds !== "number") return false;
  if (typeof maybe.loop.failureMode !== "string") return false;
  if (typeof maybe.loop.autoVerify !== "boolean") return false;
  if (!maybe.compaction || typeof maybe.compaction !== "object") return false;
  if (typeof maybe.compaction.enabled !== "boolean") return false;
  if (typeof maybe.compaction.reserveTokens !== "number") return false;
  if (typeof maybe.compaction.keepRecentTokens !== "number") return false;
  return true;
}

export function normalizeSessionStartReason(reason?: string): SessionStartReason {
  if (!reason) return "startup";
  if (reason === "startup") return "startup";
  if (reason === "resume") return "resume";
  if (reason === "new") return "new";
  if (reason === "fork") return "fork";
  if (reason === "reload") return "reload";
  return "unknown";
}

export function readLatestGlmSessionEnvSnapshot(
  entries: MaybeCustomEntry[],
): GlmSessionEnvSnapshot | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!entry || entry.type !== "custom") continue;
    if (entry.customType !== GLM_SESSION_ENV_ENTRY) continue;
    if (isGlmSessionEnvSnapshot(entry.data)) {
      return entry.data;
    }
  }
  return undefined;
}

export function buildGlmSessionEnvSnapshot(
  status: RuntimeStatus,
  reason: SessionStartReason,
): GlmSessionEnvSnapshot {
  return {
    version: 1,
    recordedAt: new Date().toISOString(),
    reason,
    provider: status.provider,
    model: status.model,
    ...(status.baseUrl ? { baseUrl: status.baseUrl } : {}),
    approvalPolicy: status.approvalPolicy,
    resolvedModel: {
      ...(status.resolvedModel.canonicalModelId
        ? { canonicalModelId: status.resolvedModel.canonicalModelId }
        : {}),
      platform: status.resolvedModel.platform,
      upstreamVendor: status.resolvedModel.upstreamVendor,
      payloadPatchPolicy: status.resolvedModel.payloadPatchPolicy,
      confidence: status.resolvedModel.confidence,
      contextWindow: status.resolvedModel.contextWindow,
      maxOutputTokens: status.resolvedModel.maxOutputTokens,
    },
    toolSignature: {
      hash: status.toolSignature.hash,
      builtinCount: status.toolSignature.builtinTools.length,
      customCount: status.toolSignature.customTools.length,
      mcpServerCount: status.mcp.configuredServerCount,
    },
    loop: {
      enabled: status.loop.enabled,
      profile: status.loop.profile,
      maxRounds: status.loop.maxRounds,
      ...(status.loop.maxToolCalls === undefined
        ? {}
        : { maxToolCalls: status.loop.maxToolCalls }),
      ...(status.loop.maxVerifyRuns === undefined
        ? {}
        : { maxVerifyRuns: status.loop.maxVerifyRuns }),
      failureMode: status.loop.failureMode,
      autoVerify: status.loop.autoVerify,
      ...(status.loop.verifyCommand ? { verifyCommand: status.loop.verifyCommand } : {}),
      ...(status.loop.verifyFallbackCommand
        ? { verifyFallbackCommand: status.loop.verifyFallbackCommand }
        : {}),
    },
    compaction: {
      enabled: status.compaction.enabled,
      reserveTokens: status.compaction.reserveTokens,
      keepRecentTokens: status.compaction.keepRecentTokens,
    },
  };
}

export type GlmSessionEnvChange = {
  key: string;
  from: unknown;
  to: unknown;
};

function pushChange(
  changes: GlmSessionEnvChange[],
  key: string,
  from: unknown,
  to: unknown,
) {
  if (from === to) return;
  changes.push({ key, from, to });
}

export function diffGlmSessionEnvSnapshots(
  previous: GlmSessionEnvSnapshot | undefined,
  next: GlmSessionEnvSnapshot,
): GlmSessionEnvChange[] {
  if (!previous) return [];

  const changes: GlmSessionEnvChange[] = [];
  pushChange(changes, "provider", previous.provider, next.provider);
  pushChange(changes, "model", previous.model, next.model);
  pushChange(changes, "baseUrl", previous.baseUrl ?? null, next.baseUrl ?? null);
  pushChange(changes, "approvalPolicy", previous.approvalPolicy, next.approvalPolicy);

  pushChange(
    changes,
    "resolvedModel.canonicalModelId",
    previous.resolvedModel.canonicalModelId ?? null,
    next.resolvedModel.canonicalModelId ?? null,
  );
  pushChange(
    changes,
    "resolvedModel.contextWindow",
    previous.resolvedModel.contextWindow,
    next.resolvedModel.contextWindow,
  );
  pushChange(
    changes,
    "resolvedModel.maxOutputTokens",
    previous.resolvedModel.maxOutputTokens,
    next.resolvedModel.maxOutputTokens,
  );
  pushChange(
    changes,
    "toolSignature.hash",
    previous.toolSignature.hash,
    next.toolSignature.hash,
  );

  pushChange(changes, "loop.enabled", previous.loop.enabled, next.loop.enabled);
  pushChange(changes, "loop.profile", previous.loop.profile, next.loop.profile);
  pushChange(changes, "loop.maxRounds", previous.loop.maxRounds, next.loop.maxRounds);
  pushChange(
    changes,
    "loop.maxToolCalls",
    previous.loop.maxToolCalls ?? null,
    next.loop.maxToolCalls ?? null,
  );
  pushChange(
    changes,
    "loop.maxVerifyRuns",
    previous.loop.maxVerifyRuns ?? null,
    next.loop.maxVerifyRuns ?? null,
  );
  pushChange(
    changes,
    "loop.failureMode",
    previous.loop.failureMode,
    next.loop.failureMode,
  );
  pushChange(changes, "loop.autoVerify", previous.loop.autoVerify, next.loop.autoVerify);
  pushChange(
    changes,
    "loop.verifyCommand",
    previous.loop.verifyCommand ?? null,
    next.loop.verifyCommand ?? null,
  );
  pushChange(
    changes,
    "loop.verifyFallbackCommand",
    previous.loop.verifyFallbackCommand ?? null,
    next.loop.verifyFallbackCommand ?? null,
  );

  pushChange(
    changes,
    "compaction.enabled",
    previous.compaction.enabled,
    next.compaction.enabled,
  );
  pushChange(
    changes,
    "compaction.reserveTokens",
    previous.compaction.reserveTokens,
    next.compaction.reserveTokens,
  );
  pushChange(
    changes,
    "compaction.keepRecentTokens",
    previous.compaction.keepRecentTokens,
    next.compaction.keepRecentTokens,
  );

  return changes;
}

