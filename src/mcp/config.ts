import { homedir } from "node:os";
import { join } from "node:path";

export type McpToolMode = "direct" | "proxy" | "hybrid";

export function resolveMcpConfigPath(env: NodeJS.ProcessEnv): string {
  const raw = env.GLM_MCP_CONFIG?.trim();
  if (raw) {
    return raw.startsWith("~/") ? join(homedir(), raw.slice(2)) : raw;
  }

  return join(homedir(), ".glm", "mcp.json");
}

export function getMcpMetadataCachePath(env: NodeJS.ProcessEnv): string {
  const raw = env.GLM_MCP_CACHE_PATH?.trim();
  if (raw) {
    return raw.startsWith("~/") ? join(homedir(), raw.slice(2)) : raw;
  }

  return join(homedir(), ".glm", "agent", "mcp-cache.json");
}

export function resolveMcpToolMode(
  value: unknown,
  options?: { strict?: boolean },
): McpToolMode {
  if (typeof value !== "string" || !value.trim()) {
    return "direct";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "direct" || normalized === "proxy" || normalized === "hybrid") {
    return normalized;
  }

  if (options?.strict) {
    throw new Error(`Unsupported MCP tool mode: ${value}`);
  }

  return "direct";
}
