import {
  type AgentSessionServices,
  AuthStorage,
  createAgentSessionServices,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import type { ProviderName } from "../providers/types.js";

export type CreateGlmManagersInput = {
  cwd: string;
  agentDir: string;
  sessionDir: string;
  authPath: string;
  modelsPath: string;
  provider: ProviderName;
  model: string;
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

export function createGlmSessionManager(
  cwd: string,
  sessionDir: string,
): SessionManager {
  return SessionManager.create(cwd, sessionDir);
}

export function createGlmManagers(input: CreateGlmManagersInput): GlmManagers {
  const authStorage = AuthStorage.create(input.authPath);
  const modelRegistry = ModelRegistry.create(authStorage, input.modelsPath);
  const settingsManager = SettingsManager.create(input.cwd, input.agentDir);
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

export async function createGlmServices(
  input: CreateGlmManagersInput,
): Promise<GlmServices> {
  const managers = createGlmManagers(input);
  const services = await createAgentSessionServices({
    cwd: input.cwd,
    agentDir: input.agentDir,
    authStorage: managers.authStorage,
    modelRegistry: managers.modelRegistry,
    settingsManager: managers.settingsManager,
  });

  return {
    ...managers,
    services,
  };
}
