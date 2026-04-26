import type { GlmConfigFile } from "../app/config-store.js";
import { buildCapabilityEnvironment, type LoopRuntimeOptions, type RuntimeConfig } from "../app/env.js";
import { getRuntimeEvents } from "./event-log.js";
import { resolveGlmProfileV2 } from "../models/resolve-glm-profile-v2.js";
import { formatCompactionSource, resolveRuntimeCompactionStatus } from "./compaction-settings.js";
import {
  getMcpMetadataCachePath,
  resolveMcpConfigPath,
  resolveMcpToolMode,
} from "../mcp/config.js";
import { readLatestVerificationArtifact } from "../harness/artifact-index.js";
import type {
  RuntimeDiagnosticsConfig,
  RuntimeGenerationStatus,
  RuntimeGlmCapabilitiesStatus,
  RuntimeNotificationStatus,
  RuntimePaths,
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
  env: NodeJS.ProcessEnv,
  config?: GlmConfigFile,
): string | undefined {
  if (provider === "glm") {
    const explicitBaseUrl =
      env.GLM_BASE_URL?.trim() || config?.providers?.glm?.baseURL?.trim();
    if (explicitBaseUrl) {
      return explicitBaseUrl;
    }

    const endpoint =
      env.GLM_ENDPOINT?.trim().toLowerCase() ||
      config?.providers?.glm?.endpoint?.trim().toLowerCase();
    if (
      endpoint === "zai" ||
      endpoint === "z.ai" ||
      endpoint === "api.z.ai" ||
      endpoint === "zai-api" ||
      endpoint === "zai-coding" ||
      endpoint === "zai-coding-plan"
    ) {
      return endpoint.includes("coding")
        ? "https://api.z.ai/api/coding/paas/v4/"
        : "https://api.z.ai/api/paas/v4/";
    }

    if (
      endpoint === "bigmodel" ||
      endpoint === "open.bigmodel.cn" ||
      endpoint === "open.bigmodel" ||
      endpoint === "bigmodel-api"
    ) {
      return "https://open.bigmodel.cn/api/paas/v4/";
    }

    return "https://open.bigmodel.cn/api/coding/paas/v4/";
  }

  if (provider === "openai-compatible" || provider === "openai-responses") {
    return (
      env.OPENAI_BASE_URL?.trim() ||
      config?.providers?.["openai-compatible"]?.baseURL?.trim() ||
      undefined
    );
  }

  if (provider === "anthropic") {
    return env.ANTHROPIC_BASE_URL?.trim() || undefined;
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
  const baseUrl = resolveRuntimeBaseUrl(args.runtime.provider, args.env, args.config);
  const capabilitiesEnv = args.config
    ? buildCapabilityEnvironment(args.env as any, args.config)
    : {};
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
    model: args.runtime.model,
    baseUrl,
    resolvedModel: (() => {
      const profile = resolveGlmProfileV2({
        provider: args.runtime.provider,
        modelId: args.runtime.model,
        baseUrl,
        overrides: args.config?.modelProfiles?.overrides,
      });

      return {
        canonicalModelId: profile.canonicalModelId,
        platform: profile.evidence.platform,
        upstreamVendor: profile.evidence.upstreamVendor,
        payloadPatchPolicy: profile.payloadPatchPolicy,
        confidence: profile.evidence.confidence,
        contextWindow: profile.effectiveCaps.contextWindow,
        maxOutputTokens: profile.effectiveCaps.maxOutputTokens,
      };
    })(),
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
      ...(args.loop.verifyFallbackCommand ? { verifyFallbackCommand: args.loop.verifyFallbackCommand } : {}),
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
  getRuntimeStatusStore().status = withEventCount(status);
}

export function getRuntimeStatus(): RuntimeStatus | undefined {
  const status = getRuntimeStatusStore().status;
  return status ? withEventCount(status) : undefined;
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

  return [
    `Cwd: ${status.cwd}`,
    `Provider: ${status.provider}`,
    `Model: ${status.model}`,
    `Base URL: ${status.baseUrl ?? "default"}`,
    `Resolved: canonical=${status.resolvedModel.canonicalModelId ?? "none"} | platform=${status.resolvedModel.platform} | upstream=${status.resolvedModel.upstreamVendor} | patch=${status.resolvedModel.payloadPatchPolicy} | confidence=${status.resolvedModel.confidence}`,
    `Model caps: contextWindow=${status.resolvedModel.contextWindow} | maxOutputTokens=${status.resolvedModel.maxOutputTokens}`,
    generationLine,
    glmLine,
    `Approval policy: ${status.approvalPolicy}`,
    `Loop: ${status.loop.enabled ? "on" : "off"} | ${status.loop.profile} | rounds ${status.loop.maxRounds}${
      status.loop.maxToolCalls === undefined ? "" : ` | tools<=${status.loop.maxToolCalls}`
    }${
      status.loop.maxVerifyRuns === undefined ? "" : ` | verify<=${status.loop.maxVerifyRuns}`
    } | fail ${status.loop.failureMode}`,
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

function compactionSourceSummary(status: RuntimeStatus): "default" | "global" | "project" | "mixed" {
  const sources = status.compaction.sources;
  const values = new Set(Object.values(sources));
  if (values.size === 1) {
    return values.values().next().value as "default" | "global" | "project";
  }
  return "mixed";
}
