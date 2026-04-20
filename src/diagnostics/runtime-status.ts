import { homedir } from "node:os";
import { join } from "node:path";
import type { LoopRuntimeOptions, RuntimeConfig } from "../app/env.js";
import { getRuntimeEvents } from "./event-log.js";
import type {
  RuntimeDiagnosticsConfig,
  RuntimePaths,
  RuntimeStatus,
} from "./types.js";

const GLM_RUNTIME_STATUS = Symbol.for("glm.runtimeStatus");

type PersistedMcpConfig = {
  mcpServers?: Record<string, { disabled?: boolean }>;
  servers?: Record<string, { disabled?: boolean }>;
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

function resolveMcpConfigPath(env: NodeJS.ProcessEnv): string {
  const raw = env.GLM_MCP_CONFIG?.trim();
  if (raw) {
    return raw.startsWith("~/") ? join(homedir(), raw.slice(2)) : raw;
  }

  return join(homedir(), ".glm", "mcp.json");
}

async function readConfiguredMcpServerCount(env: NodeJS.ProcessEnv): Promise<{
  enabled: boolean;
  configPath: string;
  configuredServerCount: number;
}> {
  const configPath = resolveMcpConfigPath(env);
  if (env.GLM_MCP_DISABLED?.trim() === "1") {
    return {
      enabled: false,
      configPath,
      configuredServerCount: 0,
    };
  }

  try {
    const file = await import("node:fs/promises");
    const raw = await file.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as PersistedMcpConfig;
    const servers = parsed.mcpServers ?? parsed.servers ?? {};
    const configuredServerCount = Object.values(servers).filter((server) => !server?.disabled).length;
    return {
      enabled: true,
      configPath,
      configuredServerCount,
    };
  } catch {
    return {
      enabled: true,
      configPath,
      configuredServerCount: 0,
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

export async function buildRuntimeStatus(args: {
  cwd: string;
  runtime: RuntimeConfig;
  loop: LoopRuntimeOptions;
  diagnostics: RuntimeDiagnosticsConfig;
  paths: RuntimePaths;
  env: NodeJS.ProcessEnv;
}): Promise<RuntimeStatus> {
  const mcp = await readConfiguredMcpServerCount(args.env);

  return withEventCount({
    cwd: args.cwd,
    provider: args.runtime.provider,
    model: args.runtime.model,
    approvalPolicy: args.runtime.approvalPolicy,
    loop: {
      enabled: args.loop.enabled,
      profile: args.loop.profile,
      maxRounds: args.loop.maxRounds,
      failureMode: args.loop.failureMode,
      autoVerify: args.loop.autoVerify,
      ...(args.loop.verifyCommand ? { verifyCommand: args.loop.verifyCommand } : {}),
      ...(args.loop.verifyFallbackCommand ? { verifyFallbackCommand: args.loop.verifyFallbackCommand } : {}),
    },
    diagnostics: {
      debugRuntime: args.diagnostics.debugRuntime,
      eventLogLimit: args.diagnostics.eventLogLimit,
      eventCount: 0,
    },
    mcp,
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

  return [
    `Cwd: ${status.cwd}`,
    `Provider: ${status.provider}`,
    `Model: ${status.model}`,
    `Approval policy: ${status.approvalPolicy}`,
    `Loop: ${status.loop.enabled ? "on" : "off"} | ${status.loop.profile} | rounds ${status.loop.maxRounds} | fail ${status.loop.failureMode}`,
    `Verifier: ${verifier}`,
    `MCP: ${status.mcp.enabled ? "enabled" : "disabled"} | servers ${status.mcp.configuredServerCount}`,
    `Diagnostics: debugRuntime=${status.diagnostics.debugRuntime} | eventLogLimit=${status.diagnostics.eventLogLimit} | events=${status.diagnostics.eventCount}`,
    `Session dir: ${status.paths.sessionDir}`,
  ];
}
