import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  type AgentSessionRuntime,
  type CreateAgentSessionResult,
  type CreateAgentSessionRuntimeFactory,
  type ModelRegistry,
} from "@mariozechner/pi-coding-agent";
import { join } from "node:path";
import { syncPackagedResources } from "../app/resource-sync.js";
import type { ApprovalPolicy } from "../app/config-store.js";
import { readConfigFile } from "../app/config-store.js";
import type { ApiKind, ProviderName } from "../providers/types.js";
import { getProviderDefaultApi, isProviderName } from "../providers/types.js";
import { createGlmServices, createGlmSessionManager } from "./managers.js";
import { resolveGlmSessionPaths } from "./session-paths.js";
import { createPlanTools } from "../tools/index.js";
import type { PromptMode } from "../prompt/mode-overlays.js";
import {
  buildNotificationEnvironment,
  resolveDiagnosticsRuntimeOptions,
  resolveLoopRuntimeOptions,
  resolveNotificationRuntimeOptions,
} from "../app/env.js";
import { buildRuntimeStatus, setRuntimeStatus } from "../diagnostics/runtime-status.js";
import { appendRuntimeEvent, configureRuntimeEventLog } from "../diagnostics/event-log.js";
import { loadHooks } from "../hooks/loader.js";
import { DEFAULT_HOOKS_PATH } from "../hooks/registry.js";
import { installShouldStopAfterTurn } from "../runtime/should-stop-after-turn.js";

export type GlmSessionInput = {
  cwd: string;
  model: string;
  provider: ProviderName;
  api: ApiKind;
  approvalPolicy: ApprovalPolicy;
  promptMode?: PromptMode;
};

export type GlmSessionOptions = GlmSessionInput & {
  promptMode: PromptMode;
  agentDir: string;
  sessionDir: string;
  authPath: string;
  modelsPath: string;
  customTools: ReturnType<typeof createPlanTools>;
};

export type GlmSessionResult = CreateAgentSessionResult & {
  options: GlmSessionOptions;
};

export type GlmModelSelection = {
  provider: string;
  api: ApiKind;
  model: string;
};

export type RuntimeModelStrategy = {
  selection?: GlmModelSelection;
  shouldPassExplicitModel: boolean;
};

const GLM_APPROVAL_POLICY_STATE = Symbol.for("glm.approvalPolicy");
type GlmApprovalPolicyState = { policy: ApprovalPolicy };

function resolveStatusProvider(provider: string | undefined, fallback: ProviderName): ProviderName {
  return provider && isProviderName(provider) ? provider : fallback;
}

function getGlmApprovalPolicyState(): GlmApprovalPolicyState {
  const existing = (globalThis as any)[GLM_APPROVAL_POLICY_STATE] as unknown;
  if (typeof existing === "object" && existing !== null) {
    const maybe = existing as Partial<GlmApprovalPolicyState>;
    if (maybe.policy === "ask" || maybe.policy === "auto" || maybe.policy === "never") {
      return maybe as GlmApprovalPolicyState;
    }
  }

  const state: GlmApprovalPolicyState = { policy: "ask" };
  (globalThis as any)[GLM_APPROVAL_POLICY_STATE] = state;
  return state;
}

function setGlmApprovalPolicy(policy: ApprovalPolicy): void {
  getGlmApprovalPolicyState().policy = policy;
}

function getGlmApprovalPolicy(fallback: ApprovalPolicy): ApprovalPolicy {
  const current = getGlmApprovalPolicyState().policy;
  return current === "ask" || current === "auto" || current === "never" ? current : fallback;
}

const MODEL_SELECTION_ENV_KEYS = [
  "GLM_PROVIDER",
  "GLM_API",
  "GLM_MODEL",
  "OPENAI_MODEL",
  "ANTHROPIC_MODEL",
] as const;
const PI_RUNTIME_ENV_KEYS = ["PI_CODING_AGENT_DIR", "PI_CODING_AGENT_SESSION_DIR"] as const;

function maybeWarnOnStoredSessionModelMismatch(args: {
  sessionManager: Pick<ReturnType<typeof createGlmSessionManager>, "buildSessionContext"> &
    Partial<Pick<ReturnType<typeof createGlmSessionManager>, "getSessionId">>;
  reason: string | undefined;
  currentSelection: GlmModelSelection | undefined;
}): void {
  const reason = args.reason?.trim();
  if (reason !== "startup" && reason !== "reload" && reason !== "resume") {
    return;
  }

  const current = args.currentSelection;
  if (!current) return;

  let savedModel: any;
  try {
    savedModel = args.sessionManager.buildSessionContext().model;
  } catch {
    return;
  }

  if (!savedModel || typeof savedModel !== "object") return;

  const savedProvider = String((savedModel as any).provider ?? "");
  const savedModelId =
    typeof (savedModel as any).modelId === "string" ? (savedModel as any).modelId.trim() : "";

  if (!isProviderName(savedProvider) || !savedModelId) return;
  if (savedProvider === current.provider && savedModelId === current.model) return;

  appendRuntimeEvent({
    type: "session.resume",
    level: "warn",
    summary: `stored session model differs: ${savedProvider}/${savedModelId} -> ${current.provider}/${current.model} (using current config)`,
    details: {
      reason,
      stored: { provider: savedProvider, model: savedModelId },
      current: { provider: current.provider, model: current.model },
      ...(typeof args.sessionManager.getSessionId === "function"
        ? { sessionId: args.sessionManager.getSessionId() }
        : {}),
    },
  });

  // Only print at process startup; avoid disrupting the interactive UI during in-session reloads.
  if (reason === "startup") {
    console.warn(
      `Resuming session created with ${savedProvider}/${savedModelId}; using ${current.provider}/${current.model}.`,
    );
  }
}
const SESSION_APPROVAL_SCOPED_METHODS = new Set([
  "abort",
  "bindExtensions",
  "compact",
  "followUp",
  "navigateTree",
  "prompt",
  "reload",
  "setModel",
  "steer",
  "cycleModel",
]);
const RUNTIME_APPROVAL_SCOPED_METHODS = new Set([
  "dispose",
  "fork",
  "importFromJsonl",
  "newSession",
  "switchSession",
]);

export async function withScopedEnvironment<T>(
  overrides: Partial<NodeJS.ProcessEnv>,
  run: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

export async function withPreservedProcessCwd<T>(run: () => Promise<T>): Promise<T> {
  const originalCwd = process.cwd();

  try {
    return await run();
  } finally {
    if (process.cwd() !== originalCwd) {
      process.chdir(originalCwd);
    }
  }
}

export function buildModelSelectionEnvironment(
  input?: GlmModelSelection,
): Partial<NodeJS.ProcessEnv> {
  const overrides: Partial<NodeJS.ProcessEnv> = Object.fromEntries(
    MODEL_SELECTION_ENV_KEYS.map((key) => [key, undefined]),
  );

  if (!input) {
    return overrides;
  }

  overrides.GLM_PROVIDER = input.provider;
  overrides.GLM_API = input.api;
  overrides.GLM_MODEL = input.model;

  if (input.api === "openai-compatible" || input.api === "openai-responses") {
    overrides.OPENAI_MODEL = input.model;
  }

  if (input.api === "anthropic") {
    overrides.ANTHROPIC_MODEL = input.model;
  }

  return overrides;
}

export function buildApprovalPolicyEnvironment(
  approvalPolicy: ApprovalPolicy,
): Partial<NodeJS.ProcessEnv> {
  return { GLM_APPROVAL_POLICY: approvalPolicy };
}

export function buildPiRuntimeEnvironment(input: {
  agentDir: string;
  sessionDir: string;
}): Partial<NodeJS.ProcessEnv> {
  const overrides: Partial<NodeJS.ProcessEnv> = Object.fromEntries(
    PI_RUNTIME_ENV_KEYS.map((key) => [key, undefined]),
  );

  overrides.PI_CODING_AGENT_DIR = input.agentDir;
  overrides.PI_CODING_AGENT_SESSION_DIR = input.sessionDir;

  return overrides;
}

export function resolveRequestedModel(
  modelRegistry: Pick<ModelRegistry, "find"> & Partial<Pick<ModelRegistry, "getAvailable">>,
  provider: string,
  modelId: string,
) {
  const model = modelRegistry.find(provider, modelId);

  if (!model) {
    const availableModels =
      typeof modelRegistry.getAvailable === "function" ? modelRegistry.getAvailable() : [];
    const availableProviderModels = availableModels.filter(
      (candidate) => candidate.provider === provider,
    );

    if (availableModels.length === 0) {
      throw new Error(
        "No configured providers are available. Configure GLM_API_KEY, OPENAI_API_KEY, or ANTHROPIC_AUTH_TOKEN, or add credentials to ~/.glm/config.json.",
      );
    }

    if (availableProviderModels.length === 0) {
      const providers = [...new Set(availableModels.map((candidate) => candidate.provider))];
      throw new Error(
        `Provider "${provider}" is not configured or has no available models. Available providers: ${providers.join(", ")}.`,
      );
    }

    const availableIds = availableProviderModels.map((candidate) => candidate.id);
    throw new Error(
      `Requested model "${provider}/${modelId}" is not available. Available models for ${provider}: ${availableIds.join(", ")}.`,
    );
  }

  return model;
}

export function getGlmModelSelection(model?: {
  provider: string;
  id: string;
}, api?: ApiKind): GlmModelSelection | undefined {
  if (!model) {
    return undefined;
  }

  return {
    provider: model.provider,
    api: api ?? "openai-compatible",
    model: model.id,
  };
}

export function resolveRuntimeModelStrategy(
  preferred: GlmModelSelection,
  sessionManager: Pick<ReturnType<typeof createGlmSessionManager>, "buildSessionContext">,
  sessionStartEvent?: {
    type: "session_start";
    reason: string;
    previousSessionFile?: string;
  },
): RuntimeModelStrategy {
  const normalizedPreferred: GlmModelSelection = {
    ...preferred,
    api: preferred.api ?? getProviderDefaultApi(preferred.provider),
  };
  const reason = sessionStartEvent?.reason;
  const shouldPinPreferredSelection =
    !reason ||
    reason === "startup" ||
    reason === "reload" ||
    reason === "new" ||
    reason === "resume" ||
    reason === "fork";

  // glm chooses to keep the currently selected model across session switches/resumes.
  // This avoids surprising behavior when users change credentials/model IDs in a new terminal
  // and then resume an older session (which may reference an outdated model ID).
  if (shouldPinPreferredSelection) {
    return { selection: normalizedPreferred, shouldPassExplicitModel: true };
  }

  const savedModel = sessionManager.buildSessionContext().model;
  if (!savedModel || !isProviderName(savedModel.provider)) {
    return { selection: normalizedPreferred, shouldPassExplicitModel: true };
  }

  return {
    selection: {
      provider: savedModel.provider,
      api: normalizedPreferred.api,
      model: savedModel.modelId,
    },
    shouldPassExplicitModel: false,
  };
}

function wrapSessionWithApprovalPolicy<T extends object>(
  session: T,
  fallbackApprovalPolicy: ApprovalPolicy,
): T {
  return new Proxy(session, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") {
        return value;
      }

      const bound = value.bind(target);
      if (!SESSION_APPROVAL_SCOPED_METHODS.has(String(property))) {
        return bound;
      }

      return (...args: unknown[]) =>
        withScopedEnvironment(
          buildApprovalPolicyEnvironment(getGlmApprovalPolicy(fallbackApprovalPolicy)),
          async () => bound(...args),
        );
    },
  });
}

function wrapRuntimeWithApprovalPolicy<T extends AgentSessionRuntime>(
  runtime: T,
  fallbackApprovalPolicy: ApprovalPolicy,
): T {
  return new Proxy(runtime, {
    get(target, property, receiver) {
      if (property === "session") {
        return wrapSessionWithApprovalPolicy(
          Reflect.get(target, property, receiver) as typeof target.session,
          fallbackApprovalPolicy,
        );
      }

      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") {
        return value;
      }

      const bound = value.bind(target);
      if (!RUNTIME_APPROVAL_SCOPED_METHODS.has(String(property))) {
        return bound;
      }

      return (...args: unknown[]) =>
        withScopedEnvironment(
          buildApprovalPolicyEnvironment(getGlmApprovalPolicy(fallbackApprovalPolicy)),
          async () => bound(...args),
        );
    },
  });
}

async function prepareGlmSession(
  options: GlmSessionOptions,
  strategy: RuntimeModelStrategy,
): Promise<{
  services: Awaited<ReturnType<typeof createGlmServices>>["services"];
  sessionManager: Awaited<ReturnType<typeof createGlmServices>>["sessionManager"];
  model?: ReturnType<typeof resolveRequestedModel>;
}> {
  await syncPackagedResources(options.agentDir);
  const config = await readConfigFile();
  const diagnostics = resolveDiagnosticsRuntimeOptions(config);
  const notifications = resolveNotificationRuntimeOptions(process.env, config);
  configureRuntimeEventLog({
    limit: diagnostics.eventLogLimit,
    persistPath: join(options.sessionDir, "artifacts", "events.jsonl"),
  });
  await loadHooks({
    enabled: config.hooksEnabled ?? true,
    hooksPath: process.env.GLM_HOOKS_PATH?.trim() || DEFAULT_HOOKS_PATH,
    hookTimeoutMs: config.hookTimeoutMs ?? 5000,
  });
  setRuntimeStatus(
    await buildRuntimeStatus({
      cwd: options.cwd,
      runtime: {
        provider: resolveStatusProvider(strategy.selection?.provider, options.provider),
        api: strategy.selection?.api ?? options.api,
        model: strategy.selection?.model ?? options.model,
        approvalPolicy: getGlmApprovalPolicy(options.approvalPolicy),
      },
      loop: resolveLoopRuntimeOptions({}, process.env, config),
      diagnostics,
      notifications,
      paths: {
        agentDir: options.agentDir,
        sessionDir: options.sessionDir,
        authPath: options.authPath,
        modelsPath: options.modelsPath,
      },
      env: process.env,
      config,
    }),
  );

  return withScopedEnvironment(
    {
      ...buildModelSelectionEnvironment(strategy.selection),
      ...buildApprovalPolicyEnvironment(getGlmApprovalPolicy(options.approvalPolicy)),
      ...buildPiRuntimeEnvironment({
        agentDir: options.agentDir,
        sessionDir: options.sessionDir,
      }),
      ...buildNotificationEnvironment(process.env, config),
    },
    async () => {
      const { services, sessionManager } = await createGlmServices(options);

      return {
        services,
        sessionManager,
        model:
          strategy.selection && strategy.shouldPassExplicitModel
            ? resolveRequestedModel(
                services.modelRegistry,
                strategy.selection.provider,
                strategy.selection.model,
              )
            : undefined,
      };
    },
  );
}

export function buildSessionOptions(input: GlmSessionInput): GlmSessionOptions {
  const paths = resolveGlmSessionPaths(input.cwd);

  return {
    ...input,
    api: input.api ?? getProviderDefaultApi(input.provider),
    promptMode: input.promptMode ?? "standard",
    ...paths,
    customTools: createPlanTools(),
  };
}

const DEFAULT_TOOL_NAMES = ["grep", "find", "ls"] as const;

function enableDefaultTools(session: {
  getActiveToolNames(): string[];
  setActiveToolsByName(names: string[]): void;
}) {
  const active = new Set(session.getActiveToolNames());
  for (const name of DEFAULT_TOOL_NAMES) {
    active.add(name);
  }
  session.setActiveToolsByName([...active]);
}

export async function createGlmSession(input: GlmSessionInput): Promise<GlmSessionResult> {
  setGlmApprovalPolicy(input.approvalPolicy);

  const options = buildSessionOptions(input);
  const { services, sessionManager, model } = await prepareGlmSession(options, {
    selection: {
      provider: input.provider,
      api: input.api,
      model: input.model,
    },
    shouldPassExplicitModel: true,
  });
  const result = await createAgentSessionFromServices({
    services,
    sessionManager,
    model,
    customTools: options.customTools,
  });
  installShouldStopAfterTurn(result.session);
  enableDefaultTools(result.session);

  return {
    ...result,
    session: wrapSessionWithApprovalPolicy(
      result.session,
      input.approvalPolicy,
    ) as typeof result.session,
    options,
  };
}

export async function createGlmRuntime(input: GlmSessionInput): Promise<AgentSessionRuntime> {
  setGlmApprovalPolicy(input.approvalPolicy);

  const initialOptions = buildSessionOptions(input);
  let preferredSelection: GlmModelSelection = {
    provider: input.provider,
    api: input.api,
    model: input.model,
  };

  const createRuntime: CreateAgentSessionRuntimeFactory = async ({
    cwd,
    sessionManager,
    sessionStartEvent,
  }) => {
    const options = buildSessionOptions({
      ...input,
      cwd,
    });
    const strategy = resolveRuntimeModelStrategy(
      preferredSelection,
      sessionManager,
      sessionStartEvent,
    );
    maybeWarnOnStoredSessionModelMismatch({
      sessionManager,
      reason: sessionStartEvent?.reason,
      currentSelection: strategy.selection ?? preferredSelection,
    });

    const { services, model } = await prepareGlmSession(options, strategy);
    const result = await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
      model,
      customTools: options.customTools,
    });
    installShouldStopAfterTurn(result.session);
    enableDefaultTools(result.session);
    const activeSelection =
      getGlmModelSelection(result.session.model, strategy.selection?.api ?? preferredSelection.api) ??
      strategy.selection;
    if (activeSelection) {
      await syncPackagedResources(options.agentDir);
      const config = await readConfigFile();
      const status = await buildRuntimeStatus({
        cwd: options.cwd,
        runtime: {
          provider: resolveStatusProvider(activeSelection.provider, options.provider),
          api: activeSelection.api,
          model: activeSelection.model,
          approvalPolicy: getGlmApprovalPolicy(options.approvalPolicy),
        },
        loop: resolveLoopRuntimeOptions({}, process.env, config),
        diagnostics: resolveDiagnosticsRuntimeOptions(config),
        notifications: resolveNotificationRuntimeOptions(process.env, config),
        paths: {
          agentDir: options.agentDir,
          sessionDir: options.sessionDir,
          authPath: options.authPath,
          modelsPath: options.modelsPath,
        },
        env: process.env,
        config,
      });
      setRuntimeStatus(status);
    }
    preferredSelection =
      getGlmModelSelection(result.session.model, activeSelection?.api ?? preferredSelection.api) ??
      preferredSelection;

    return {
      ...result,
      services,
      diagnostics: services.diagnostics,
    };
  };

  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd: input.cwd,
    agentDir: initialOptions.agentDir,
    sessionManager: createGlmSessionManager(initialOptions.cwd, initialOptions.sessionDir),
  });

  const originalNewSession = runtime.newSession.bind(runtime);
  runtime.newSession = async (options) => {
    preferredSelection =
      getGlmModelSelection(runtime.session.model, preferredSelection.api) ?? preferredSelection;
    return originalNewSession(options);
  };

  const originalSwitchSession = runtime.switchSession.bind(runtime);
  runtime.switchSession = async (sessionPath, cwdOverride) => {
    preferredSelection =
      getGlmModelSelection(runtime.session.model, preferredSelection.api) ?? preferredSelection;
    return originalSwitchSession(sessionPath, cwdOverride);
  };

  const originalFork = runtime.fork.bind(runtime);
  runtime.fork = async (entryId) => {
    preferredSelection =
      getGlmModelSelection(runtime.session.model, preferredSelection.api) ?? preferredSelection;
    return originalFork(entryId);
  };

  const originalImportFromJsonl = runtime.importFromJsonl.bind(runtime);
  runtime.importFromJsonl = async (sessionPath, cwdOverride) => {
    preferredSelection =
      getGlmModelSelection(runtime.session.model, preferredSelection.api) ?? preferredSelection;
    return originalImportFromJsonl(sessionPath, cwdOverride);
  };

  return wrapRuntimeWithApprovalPolicy(runtime, input.approvalPolicy);
}
