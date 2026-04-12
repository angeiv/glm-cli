import { homedir } from "node:os";
import { join } from "node:path";

export function getGlmRootDir(): string {
  return join(homedir(), ".glm");
}

export function getGlmAgentDir(): string {
  return join(getGlmRootDir(), "agent");
}

export function getGlmConfigPath(): string {
  return join(getGlmRootDir(), "config.json");
}

export function getGlmSessionsDir(): string {
  return join(getGlmRootDir(), "sessions");
}

export function getGlmLogsDir(): string {
  return join(getGlmRootDir(), "logs");
}
