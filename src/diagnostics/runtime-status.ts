import type { GlmConfigFile } from "../app/config-store.js";
import {
  buildCapabilityEnvironment,
  type LoopRuntimeOptions,
  type RuntimeConfig,
} from "../app/env.js";
import { appendRuntimeEvent, getRuntimeEvents } from "./event-log.js";
import { resolveRuntimeModelProfile } from "../models/runtime-model-profile.js";
import { resolveModelDiscoveryStatus } from "../models/model-discovery.js";
import { formatCompactionSource, resolveRuntimeCompactionStatus } from "./compaction-settings.js";
import {
  getMcpMetadataCachePath,
  resolveMcpConfigPath,
  resolveMcpToolMode,
} from "../mcp/config.js";
import { readLatestVerificationArtifact } from "../harness/artifact-index.js";
import { resolveProviderBaseUrl } from "../providers/settings.js";
import {
  type ApiKind,
  getProviderDefaultApi,
  isProviderName,
  normalizeApiKind,
  resolveProviderInput,
} from "../providers/types.js";
import type {
  RuntimeDiagnosticsConfig,
  RuntimeGenerationStatus,
  RuntimeGlmCapabilitiesStatus,
  RuntimeLoopStatus,
  RuntimeNotificationStatus,
  RuntimePaths,
  RuntimeResolvedModelStatus,
  RuntimeStatus,
  RuntimeVerificationStatus,
} from "./types.js";
import { computeRuntimeToolSignature } from "./tool-signature.js";

const GLM_RUNTIME_STATUS = Symbol.for("glm.runtimeStatus");

type PersistedMcpConfig = {
  mcpServers?: Record<string, { disabled?: boolean; toolMode?: unknown }>;
  servers?: Record<string, { disabled?: boolean; toolMode?: unknown }>;
};

function getRuntimeStatusStore(): { status?: RuntimeStatus } {
  const existing = (globalThis as Record<PropertyKey, unknown>)[GLM_RUNTIME_STATUS] as
    | { status?: RuntimeStatus }
    | undefined;
  if (existing && typeof existing === "object") {
    return existing;
  }

  const state: { status?: RuntimeStatus } = {};
  (globalThis as Record<PropertyKey, unknown>)[GLM_RUNTIME_STATUS] = state;
  return state;
}

async function readConfiguredMcpServerCount(env: NodeJS.ProcessEnv): Promise<{
  enabled: boolean;
  configPath: string;
  cachePath: string;
  configuredServerCount: number;
  modeCounts: {
    direct: number;
    proxy: number;
    hybrid: number;
  };
}> {
  const configPath = resolveMcpConfigPath(env);
  const cachePath = getMcpMetadataCachePath(env);
  if (env.GLM_MCP_DISABLED?.trim() === "1") {
    return {
      enabled: false,
      configPath,
      cachePath,
      configuredServerCount: 0,
      modeCounts: {
        direct: 0,
        proxy: 0,
        hybrid: 0,
      },
    };
  }

  try {
    const file = await import("node:fs/promises");
    const raw = await file.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as PersistedMcpConfig;
    const servers = parsed.mcpServers ?? parsed.servers ?? {};
    const enabledServers = Object.values(servers).filter((server) => !server?.disabled);
    const modeCounts = enabledServers.reduce(
      (counts, server) => {
        counts[resolveMcpToolMode(server?.toolMode)] += 1;
        return counts;
      },
      {
        direct: 0,
        proxy: 0,
        hybrid: 0,
      },
    );

    return {
      enabled: true,
      configPath,
      cachePath,
      configuredServerCount: enabledServers.length,
      modeCounts,
    };
  } catch {
    return {
      enabled: true,
      configPath,
      cachePath,
      configuredServerCount: 0,
      modeCounts: {
        direct: 0,
        proxy: 0,
        hybrid: 0,
      },
    };
  }
}

function withEventCount(status: RuntimeStatus): RuntimeStatus {
  return {
    ...status,
    diagnostics: {
      ...status.diagnostics,
      eventCount: getRuntimeEvents().length,
    },
  };
}

async function readVerificationStatus(cwd: string): Promise<RuntimeVerificationStatus> {
  const latest = await readLatestVerificationArtifact(cwd);
  if (!latest) {
    return {};
  }

  const verification = latest.artifact.verification;
  return {
    latest: {
      artifactPath: latest.artifactPath,
      createdAt: latest.artifact.createdAt,
      ...(latest.artifact.scenario ? { scenario: latest.artifact.scenario } : {}),
      kind: verification.kind,
      ...(verification.command ? { command: verification.command } : {}),
      ...(verification.exitCode === undefined ? {} : { exitCode: verification.exitCode }),
      summary: verification.summary,
    },
  };
}

function resolveRuntimeBaseUrl(
  provider: string,
  api: string | undefined,
  env: NodeJS.ProcessEnv,
  config?: GlmConfigFile,
): string | undefined {
  const providerInput = resolveProviderInput(provider);
  const canonicalProvider = isProviderName(provider) ? provider : providerInput?.provider;
  const effectiveApi =
    normalizeApiKind(api) ??
    providerInput?.apiHint ??
    (canonicalProvider ? getProviderDefaultApi(canonicalProvider) : undefined);

  if (
    canonicalProvider &&
    effectiveApi &&
    (effectiveApi === "openai-compatible" ||
      effectiveApi === "openai-responses" ||
      effectiveApi === "anthropic")
  ) {
    return resolveProviderBaseUrl(
      canonicalProvider,
      effectiveApi,
      env,
      config?.providers?.[canonicalProvider],
    );
  }

  return undefined;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return undefined;
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatCapabilityFlag(enabled: boolean): "on" | "off" {
  return enabled ? "on" : "off";
}

function buildResolvedModelStatus(args: {
  provider: string;
  api: ApiKind;
  model: string;
  baseUrl?: string;
  overrides?: GlmConfigFile["modelOverrides"];
}): RuntimeResolvedModelStatus {
  const profile = resolveRuntimeModelProfile({
    provider: args.provider,
    api: args.api,
    modelId: args.model,
    baseUrl: args.baseUrl,
    overrides: args.overrides,
  });

  const capabilityMatrix = {
    modalities: profile.effectiveModalities,
    thinking: profile.effectiveCaps.supportsThinking,
    preservedThinking: profile.effectiveCaps.supportsPreservedThinking,
    streaming: profile.effectiveCaps.supportsStreaming,
    toolCall: profile.effectiveCaps.supportsToolCall,
    toolStream: profile.effectiveCaps.supportsToolStream,
    structuredOutput: profile.effectiveCaps.supportsStructuredOutput,
    cache: profile.effectiveCaps.supportsCache,
    mcp: profile.effectiveCaps.supportsMcp,
    zhipuNativePatch: profile.patchPipeline.zhipuNative,
    dashscopeCompatPatch: profile.patchPipeline.dashscopeCompat,
  };

  return {
    family: profile.family,
    transport: profile.transport,
    gateway: profile.gateway,
    canonicalModelId: profile.canonicalModelId,
    platform: profile.evidence.platform,
    upstreamVendor: profile.evidence.upstreamVendor,
    payloadPatchPolicy: profile.payloadPatchPolicy,
    confidence: profile.evidence.confidence,
    modalities: profile.effectiveModalities,
    patchPipeline: profile.patchPipeline,
    capabilityMatrix,
    contextWindow: profile.effectiveCaps.contextWindow,
    maxOutputTokens: profile.effectiveCaps.maxOutputTokens,
    supportsThinking: profile.effectiveCaps.supportsThinking,
    supportsPreservedThinking: profile.effectiveCaps.supportsPreservedThinking,
    supportsStreaming: profile.effectiveCaps.supportsStreaming,
    supportsToolCall: profile.effectiveCaps.supportsToolCall,
    supportsToolStream: profile.effectiveCaps.supportsToolStream,
    supportsCache: profile.effectiveCaps.supportsCache,
    supportsStructuredOutput: profile.effectiveCaps.supportsStructuredOutput,
    supportsMcp: profile.effectiveCaps.supportsMcp,
  };
}

function formatCapabilityMatrixLine(status: RuntimeStatus): string {
  const matrix = status.resolvedModel.capabilityMatrix;
  return [
    `Capability matrix: input=${matrix.modalities.join(",") || "none"}`,
    `thinking=${formatCapabilityFlag(matrix.thinking)}`,
    `preservedThinking=${formatCapabilityFlag(matrix.preservedThinking)}`,
    `streaming=${formatCapabilityFlag(matrix.streaming)}`,
    `toolCall=${formatCapabilityFlag(matrix.toolCall)}`,
    `toolStream=${formatCapabilityFlag(matrix.toolStream)}`,
    `struct=${formatCapabilityFlag(matrix.structuredOutput)}`,
    `cache=${formatCapabilityFlag(matrix.cache)}`,
    `mcp=${formatCapabilityFlag(matrix.mcp)}`,
    `zhipuNativePatch=${formatCapabilityFlag(matrix.zhipuNativePatch)}`,
    `dashscopeCompatPatch=${formatCapabilityFlag(matrix.dashscopeCompatPatch)}`,
  ].join(" | ");
}

export async function buildRuntimeStatus(args: {
  cwd: string;
  runtime: RuntimeConfig;
  loop: LoopRuntimeOptions;
  diagnostics: RuntimeDiagnosticsConfig;
  notifications: RuntimeNotificationStatus;
  paths: RuntimePaths;
  env: NodeJS.ProcessEnv;
  config?: GlmConfigFile;
}): Promise<RuntimeStatus> {
  const mcp = await readConfiguredMcpServerCount(args.env);
  const toolSignature = await computeRuntimeToolSignature({
    cwd: args.cwd,
    env: args.env,
  });
  const verification = await readVerificationStatus(args.cwd);
  const compaction = await resolveRuntimeCompactionStatus({
    agentDir: args.paths.agentDir,
    cwd: args.cwd,
  });
  const runtimeProviderInput = resolveProviderInput(args.runtime.provider);
  const effectiveApi =
    normalizeApiKind(args.runtime.api) ??
    runtimeProviderInput?.apiHint ??
    (isProviderName(args.runtime.provider)
      ? getProviderDefaultApi(args.runtime.provider)
      : runtimeProviderInput
        ? getProviderDefaultApi(runtimeProviderInput.provider)
        : "openai-compatible");
  const baseUrl = resolveRuntimeBaseUrl(args.runtime.provider, effectiveApi, args.env, args.config);
  const capabilitiesEnv = args.config
    ? buildCapabilityEnvironment(args.env as any, args.config)
    : {};
  const modelDiscovery =
    baseUrl && effectiveApi !== "anthropic"
      ? await resolveModelDiscoveryStatus({
          provider: args.runtime.provider,
          api: effectiveApi,
          baseUrl,
        })
      : undefined;
  const generation: RuntimeGenerationStatus = {
    ...(parseOptionalInteger(capabilitiesEnv.GLM_MAX_OUTPUT_TOKENS) === undefined
      ? {}
      : { maxOutputTokens: parseOptionalInteger(capabilitiesEnv.GLM_MAX_OUTPUT_TOKENS)! }),
    ...(parseOptionalNumber(capabilitiesEnv.GLM_TEMPERATURE) === undefined
      ? {}
      : { temperature: parseOptionalNumber(capabilitiesEnv.GLM_TEMPERATURE)! }),
    ...(parseOptionalNumber(capabilitiesEnv.GLM_TOP_P) === undefined
      ? {}
      : { topP: parseOptionalNumber(capabilitiesEnv.GLM_TOP_P)! }),
  };
  const glmCapabilities: RuntimeGlmCapabilitiesStatus = {
    ...(capabilitiesEnv.GLM_THINKING_MODE
      ? { thinkingMode: String(capabilitiesEnv.GLM_THINKING_MODE) }
      : {}),
    ...(parseOptionalBoolean(capabilitiesEnv.GLM_CLEAR_THINKING) === undefined
      ? {}
      : { clearThinking: parseOptionalBoolean(capabilitiesEnv.GLM_CLEAR_THINKING)! }),
    ...(capabilitiesEnv.GLM_TOOL_STREAM
      ? { toolStream: String(capabilitiesEnv.GLM_TOOL_STREAM) }
      : {}),
    ...(capabilitiesEnv.GLM_RESPONSE_FORMAT
      ? { responseFormat: String(capabilitiesEnv.GLM_RESPONSE_FORMAT) }
      : {}),
  };

  return withEventCount({
    cwd: args.cwd,
    provider: args.runtime.provider,
    api: effectiveApi,
    model: args.runtime.model,
    baseUrl,
    resolvedModel: buildResolvedModelStatus({
      provider: args.runtime.provider,
      api: effectiveApi,
      model: args.runtime.model,
      baseUrl,
      overrides: args.config?.modelOverrides,
    }),
    ...(modelDiscovery ? { modelDiscovery } : {}),
    generation,
    glmCapabilities,
    toolSignature,
    approvalPolicy: args.runtime.approvalPolicy,
    loop: {
      enabled: args.loop.enabled,
      profile: args.loop.profile,
      maxRounds: args.loop.maxRounds,
      ...(args.loop.maxToolCalls === undefined ? {} : { maxToolCalls: args.loop.maxToolCalls }),
      ...(args.loop.maxVerifyRuns === undefined ? {} : { maxVerifyRuns: args.loop.maxVerifyRuns }),
      failureMode: args.loop.failureMode,
      autoVerify: args.loop.autoVerify,
      ...(args.loop.verifyCommand ? { verifyCommand: args.loop.verifyCommand } : {}),
      ...(args.loop.verifyFallbackCommand
        ? { verifyFallbackCommand: args.loop.verifyFallbackCommand }
        : {}),
    },
    compaction,
    diagnostics: {
      debugRuntime: args.diagnostics.debugRuntime,
      eventLogLimit: args.diagnostics.eventLogLimit,
      eventCount: 0,
    },
    notifications: args.notifications,
    mcp,
    verification,
    paths: args.paths,
  });
}

export function setRuntimeStatus(status: RuntimeStatus): void {
  const store = getRuntimeStatusStore();
  const previous = store.status;

  if (
    previous?.toolSignature?.hash &&
    status.toolSignature?.hash &&
    previous.toolSignature.hash !== status.toolSignature.hash
  ) {
    appendRuntimeEvent({
      type: "tools.changed",
      level: "warn",
      summary: `tool signature changed: ${previous.toolSignature.hash.slice(0, 12)} -> ${status.toolSignature.hash.slice(0, 12)}`,
      details: {
        before: {
          hash: previous.toolSignature.hash,
          builtinTools: previous.toolSignature.builtinTools,
          customTools: previous.toolSignature.customTools,
          mcp: previous.toolSignature.mcp,
        },
        after: {
          hash: status.toolSignature.hash,
          builtinTools: status.toolSignature.builtinTools,
          customTools: status.toolSignature.customTools,
          mcp: status.toolSignature.mcp,
        },
      },
    });
  }

  store.status = withEventCount(status);
}

export function getRuntimeStatus(): RuntimeStatus | undefined {
  const status = getRuntimeStatusStore().status;
  return status ? withEventCount(status) : undefined;
}

export function patchRuntimeLoopStatus(patch: Partial<RuntimeLoopStatus>): void {
  const store = getRuntimeStatusStore();
  const status = store.status;
  if (!status) return;

  store.status = withEventCount({
    ...status,
    loop: {
      ...status.loop,
      ...patch,
    },
  });
}

export function clearRuntimeStatus(): void {
  delete getRuntimeStatusStore().status;
}

export function formatRuntimeStatusLines(status: RuntimeStatus): string[] {
  const verifier = status.loop.verifyCommand
    ? status.loop.verifyCommand
    : status.loop.verifyFallbackCommand
      ? `auto-detect (fallback: ${status.loop.verifyFallbackCommand})`
      : "auto-detect";

  const generationParts: string[] = [];
  if (status.generation?.maxOutputTokens !== undefined) {
    generationParts.push(`maxOutputTokens=${status.generation.maxOutputTokens}`);
  }
  if (status.generation?.temperature !== undefined) {
    generationParts.push(`temperature=${status.generation.temperature}`);
  }
  if (status.generation?.topP !== undefined) {
    generationParts.push(`topP=${status.generation.topP}`);
  }
  const generationLine =
    generationParts.length > 0
      ? `Generation: ${generationParts.join(" | ")}`
      : "Generation: default";

  const glmParts: string[] = [];
  if (status.glmCapabilities?.thinkingMode) {
    glmParts.push(`thinkingMode=${status.glmCapabilities.thinkingMode}`);
  }
  if (status.glmCapabilities?.clearThinking !== undefined) {
    glmParts.push(`clearThinking=${status.glmCapabilities.clearThinking ? "on" : "off"}`);
  }
  if (status.glmCapabilities?.toolStream) {
    glmParts.push(`toolStream=${status.glmCapabilities.toolStream}`);
  }
  if (status.glmCapabilities?.responseFormat) {
    glmParts.push(`responseFormat=${status.glmCapabilities.responseFormat}`);
  }
  const glmLine =
    glmParts.length > 0 ? `GLM overrides: ${glmParts.join(" | ")}` : "GLM overrides: none";

  const loopSpendParts: string[] = [];
  if (status.loop.roundsUsed !== undefined) {
    loopSpendParts.push(`usedRounds ${status.loop.roundsUsed}/${status.loop.maxRounds}`);
  }
  if (status.loop.toolCallsUsed !== undefined) {
    loopSpendParts.push(
      status.loop.maxToolCalls === undefined
        ? `usedTools ${status.loop.toolCallsUsed}`
        : `usedTools ${status.loop.toolCallsUsed}/${status.loop.maxToolCalls}`,
    );
  }
  if (status.loop.verifyRunsUsed !== undefined) {
    loopSpendParts.push(
      status.loop.maxVerifyRuns === undefined
        ? `usedVerify ${status.loop.verifyRunsUsed}`
        : `usedVerify ${status.loop.verifyRunsUsed}/${status.loop.maxVerifyRuns}`,
    );
  }
  const loopModePart = status.loop.mode ? ` | mode ${status.loop.mode}` : "";
  const loopPhasePart = status.loop.phase ? ` | phase ${status.loop.phase}` : "";
  const loopSpendPart = loopSpendParts.length > 0 ? ` | ${loopSpendParts.join(" | ")}` : "";
  const modelDiscoveryLine = status.modelDiscovery
    ? `Model discovery: ${status.modelDiscovery.supported ? status.modelDiscovery.source : "unsupported"} | models=${status.modelDiscovery.modelCount ?? 0}${status.modelDiscovery.fetchedAt ? ` | fetchedAt=${status.modelDiscovery.fetchedAt}` : ""}${status.modelDiscovery.stale ? " | stale=yes" : ""}${status.modelDiscovery.error ? ` | error=${status.modelDiscovery.error}` : ""}`
    : "Model discovery: unavailable";

  return [
    `Cwd: ${status.cwd}`,
    `Provider: ${status.provider}`,
    `API: ${status.api}`,
    `Model: ${status.model}`,
    `Base URL: ${status.baseUrl ?? "default"}`,
    `Resolved: family=${status.resolvedModel.family} | transport=${status.resolvedModel.transport} | gateway=${status.resolvedModel.gateway} | canonical=${status.resolvedModel.canonicalModelId ?? "none"} | upstream=${status.resolvedModel.upstreamVendor} | patch=${status.resolvedModel.payloadPatchPolicy} | confidence=${status.resolvedModel.confidence}`,
    `Model caps: contextWindow=${status.resolvedModel.contextWindow} | maxOutputTokens=${status.resolvedModel.maxOutputTokens} | thinking=${status.resolvedModel.supportsThinking ? "on" : "off"} | preservedThinking=${status.resolvedModel.supportsPreservedThinking ? "on" : "off"} | toolCall=${status.resolvedModel.supportsToolCall ? "on" : "off"} | toolStream=${status.resolvedModel.supportsToolStream ? "on" : "off"} | struct=${status.resolvedModel.supportsStructuredOutput ? "on" : "off"} | cache=${status.resolvedModel.supportsCache ? "on" : "off"} | mcp=${status.resolvedModel.supportsMcp ? "on" : "off"}`,
    formatCapabilityMatrixLine(status),
    modelDiscoveryLine,
    generationLine,
    glmLine,
    `Approval policy: ${status.approvalPolicy}`,
    `Loop: ${status.loop.enabled ? "on" : "off"} | ${status.loop.profile} | rounds ${status.loop.maxRounds}${
      status.loop.maxToolCalls === undefined ? "" : ` | tools<=${status.loop.maxToolCalls}`
    }${
      status.loop.maxVerifyRuns === undefined ? "" : ` | verify<=${status.loop.maxVerifyRuns}`
    } | fail ${status.loop.failureMode}${loopModePart}${loopPhasePart}${loopSpendPart}`,
    `Compaction: ${status.compaction.enabled ? "on" : "off"} | reserve=${status.compaction.reserveTokens} | keepRecent=${status.compaction.keepRecentTokens} | source=${formatCompactionSource(compactionSourceSummary(status))}`,
    `Tool signature: ${status.toolSignature.hash.slice(0, 12)} (builtin ${status.toolSignature.builtinTools.length} | custom ${status.toolSignature.customTools.length} | mcp ${status.mcp.configuredServerCount})`,
    `Verifier: ${verifier}`,
    `Notifications: ${status.notifications.enabled ? "on" : "off"} | turnEnd ${status.notifications.onTurnEnd ? "on" : "off"} | loopResult ${status.notifications.onLoopResult ? "on" : "off"}`,
    `MCP: ${status.mcp.enabled ? "enabled" : "disabled"} | servers ${status.mcp.configuredServerCount} | direct ${status.mcp.modeCounts.direct} | proxy ${status.mcp.modeCounts.proxy} | hybrid ${status.mcp.modeCounts.hybrid}`,
    status.verification.latest
      ? `Verification: ${status.verification.latest.scenario ? `${status.verification.latest.scenario} | ` : ""}${status.verification.latest.kind} | ${status.verification.latest.command ?? "no command"} | ${status.verification.latest.summary} | ${status.verification.latest.artifactPath}`
      : "Verification: none",
    `Diagnostics: debugRuntime=${status.diagnostics.debugRuntime} | eventLogLimit=${status.diagnostics.eventLogLimit} | events=${status.diagnostics.eventCount}`,
    `Session dir: ${status.paths.sessionDir}`,
  ];
}

function compactionSourceSummary(
  status: RuntimeStatus,
): "default" | "global" | "project" | "mixed" {
  const sources = status.compaction.sources;
  const values = new Set(Object.values(sources));
  if (values.size === 1) {
    return values.values().next().value as "default" | "global" | "project";
  }
  return "mixed";
}
