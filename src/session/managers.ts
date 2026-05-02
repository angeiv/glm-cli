import {
  type AgentSessionServices,
  AuthStorage,
  createAgentSessionServices,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import type { ProviderName } from "../providers/types.js";
import type { ApiKind } from "../providers/types.js";
import { readConfigFile } from "../app/config-store.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildRuntimePromptStack } from "../runtime/prompt.js";
import type { PromptMode } from "../prompt/mode-overlays.js";
import { resolveProviderCredential } from "../providers/settings.js";

export type CreateGlmManagersInput = {
  cwd: string;
  agentDir: string;
  sessionDir: string;
  authPath: string;
  modelsPath: string;
  provider: ProviderName;
  api: ApiKind;
  model: string;
  promptMode: PromptMode;
};

export type GlmManagers = {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  settingsManager: SettingsManager;
  sessionManager: SessionManager;
};

export type GlmServices = GlmManagers & {
  services: AgentSessionServices;
};

type SettingsJson = Record<string, unknown>;

function readGlobalSettingsJson(agentDir: string): SettingsJson | undefined {
  const settingsPath = join(agentDir, "settings.json");
  if (!existsSync(settingsPath)) return undefined;

  try {
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as SettingsJson;
    }
  } catch {
    // Ignore invalid settings.json and let Pi handle defaults.
  }

  return undefined;
}

function hasOwnSetting(settings: SettingsJson | undefined, key: string): boolean {
  return Boolean(settings && Object.hasOwn(settings, key));
}

function applyGlmSettingsDefaults(settingsManager: SettingsManager, agentDir: string): void {
  const settings = readGlobalSettingsJson(agentDir);

  // glm defaults: keep startup quieter and disable install telemetry unless user opted in.
  if (!hasOwnSetting(settings, "quietStartup")) {
    settingsManager.setQuietStartup(true);
  }
  if (!hasOwnSetting(settings, "collapseChangelog")) {
    settingsManager.setCollapseChangelog(true);
  }
  if (!hasOwnSetting(settings, "enableInstallTelemetry")) {
    settingsManager.setEnableInstallTelemetry(false);
  }
}

export function createGlmSessionManager(cwd: string, sessionDir: string): SessionManager {
  return SessionManager.create(cwd, sessionDir);
}

export function createGlmManagers(input: CreateGlmManagersInput): GlmManagers {
  const authStorage = AuthStorage.create(input.authPath);
  const modelRegistry = ModelRegistry.create(authStorage, input.modelsPath);
  const settingsManager = SettingsManager.create(input.cwd, input.agentDir);
  applyGlmSettingsDefaults(settingsManager, input.agentDir);
  settingsManager.applyOverrides({
    sessionDir: input.sessionDir,
  });

  return {
    authStorage,
    modelRegistry,
    settingsManager,
    sessionManager: createGlmSessionManager(input.cwd, input.sessionDir),
  };
}

export async function createGlmServices(input: CreateGlmManagersInput): Promise<GlmServices> {
  const managers = createGlmManagers(input);
  const promptStack = await buildRuntimePromptStack({
    agentDir: input.agentDir,
    cwd: input.cwd,
    mode: input.promptMode,
  });
  const config = await readConfigFile();
  const resolvedApiKey = resolveProviderCredential(
    input.provider,
    input.api,
    process.env,
    config.providers[input.provider],
  );

  // Make env/config credentials take precedence over any stale ~/.glm/agent/auth.json entries.
  // This is important when resuming older sessions from a new terminal with updated credentials.
  if (resolvedApiKey) {
    managers.authStorage.setRuntimeApiKey(input.provider, resolvedApiKey);
  }

  const registerMcpExtension = (
    await import(new URL("../../resources/extensions/glm-mcp/index.js", import.meta.url).href)
  ).default;

  // Load the Dashscope/Bailian request patch inline as well so it runs after all
  // on-disk extensions. This ensures the final payload respects gateway constraints
  // even when other extensions override max token fields.
  const registerDashscopeExtension = (
    await import(new URL("../../resources/extensions/glm-dashscope/index.js", import.meta.url).href)
  ).default;

  const services = await createAgentSessionServices({
    cwd: input.cwd,
    agentDir: input.agentDir,
    authStorage: managers.authStorage,
    modelRegistry: managers.modelRegistry,
    settingsManager: managers.settingsManager,
    resourceLoaderOptions: {
      systemPromptOverride: () => promptStack.systemPrompt,
      appendSystemPromptOverride: () => [...promptStack.appendSystemPrompt],
      extensionFactories: [registerMcpExtension, registerDashscopeExtension],
    },
  });

  return {
    ...managers,
    services,
  };
}
