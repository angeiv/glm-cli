import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  type AgentSessionRuntime,
  type CreateAgentSessionResult,
  type CreateAgentSessionRuntimeFactory,
  type ModelRegistry,
} from "@mariozechner/pi-coding-agent";
import { syncPackagedResources } from "../app/resource-sync.js";
import type { ApprovalPolicy } from "../app/config-store.js";
import type { ProviderName } from "../providers/types.js";
import { createGlmServices, createGlmSessionManager } from "./managers.js";
import { resolveGlmSessionPaths } from "./session-paths.js";
import { createBuiltinTools, createPlanTools } from "../tools/index.js";

export type GlmSessionInput = {
  cwd: string;
  model: string;
  provider: ProviderName;
  approvalPolicy: ApprovalPolicy;
};

export type GlmSessionOptions = GlmSessionInput & {
  agentDir: string;
  sessionDir: string;
  authPath: string;
  modelsPath: string;
  tools: ReturnType<typeof createBuiltinTools>;
  customTools: ReturnType<typeof createPlanTools>;
};

export type GlmSessionResult = CreateAgentSessionResult & {
  options: GlmSessionOptions;
};

export type GlmModelSelection = {
  provider: string;
  model: string;
};

export type RuntimeModelStrategy = {
  selection?: GlmModelSelection;
  shouldPassExplicitModel: boolean;
};

const MODEL_SELECTION_ENV_KEYS = [
  "GLM_MODEL",
  "OPENAI_MODEL",
  "ANTHROPIC_MODEL",
] as const;
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

function normalizeGlmProviderId(provider: string): string {
  return provider === "glm-official" ? "glm" : provider;
}

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

export async function withPreservedProcessCwd<T>(
  run: () => Promise<T>,
): Promise<T> {
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

  if (input.provider === "openai-compatible") {
    overrides.OPENAI_MODEL = input.model;
  }

  if (input.provider === "anthropic") {
    overrides.ANTHROPIC_MODEL = input.model;
  }

  return overrides;
}

export function buildApprovalPolicyEnvironment(
  approvalPolicy: ApprovalPolicy,
): Partial<NodeJS.ProcessEnv> {
  return { GLM_APPROVAL_POLICY: approvalPolicy };
}

export function resolveRequestedModel(
  modelRegistry: Pick<ModelRegistry, "find">,
  provider: string,
  modelId: string,
) {
  const model = modelRegistry.find(provider, modelId);

  if (!model) {
    throw new Error(`Requested model "${provider}/${modelId}" is not available`);
  }

  return model;
}

export function getGlmModelSelection(
  model?: { provider: string; id: string },
): GlmModelSelection | undefined {
  if (!model) {
    return undefined;
  }

  return {
    provider: normalizeGlmProviderId(model.provider),
    model: model.id,
  };
}

export function resolveRuntimeModelStrategy(
  preferred: GlmModelSelection,
  sessionManager: Pick<
    ReturnType<typeof createGlmSessionManager>,
    "buildSessionContext"
  >,
  sessionStartEvent?: { type: "session_start"; reason: string },
): RuntimeModelStrategy {
  if (!sessionStartEvent) {
    return {
      selection: preferred,
      shouldPassExplicitModel: true,
    };
  }

  const savedModel = sessionManager.buildSessionContext().model;
  if (savedModel) {
    const provider = normalizeGlmProviderId(savedModel.provider);
    return {
      selection: {
        provider,
        model: savedModel.modelId,
      },
      // If we had to normalize a legacy provider id, pass explicit model to avoid Pi restoring
      // a now-unknown provider from session history.
      shouldPassExplicitModel: provider !== savedModel.provider,
    };
  }

  if (sessionStartEvent.reason === "new") {
    return {
      selection: preferred,
      shouldPassExplicitModel: true,
    };
  }

  return {
    selection: undefined,
    shouldPassExplicitModel: false,
  };
}

function wrapSessionWithApprovalPolicy<T extends object>(
  session: T,
  approvalPolicy: ApprovalPolicy,
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
          buildApprovalPolicyEnvironment(approvalPolicy),
          async () => bound(...args),
        );
    },
  });
}

function wrapRuntimeWithApprovalPolicy<T extends AgentSessionRuntime>(
  runtime: T,
  approvalPolicy: ApprovalPolicy,
): T {
  return new Proxy(runtime, {
    get(target, property, receiver) {
      if (property === "session") {
        return wrapSessionWithApprovalPolicy(
          Reflect.get(target, property, receiver) as typeof target.session,
          approvalPolicy,
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
          buildApprovalPolicyEnvironment(approvalPolicy),
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

  return withScopedEnvironment(
    {
      ...buildModelSelectionEnvironment(strategy.selection),
      ...buildApprovalPolicyEnvironment(options.approvalPolicy),
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
    ...paths,
    tools: createBuiltinTools(input.cwd),
    customTools: createPlanTools(),
  };
}

export async function createGlmSession(
  input: GlmSessionInput,
): Promise<GlmSessionResult> {
  const options = buildSessionOptions(input);
  const { services, sessionManager, model } = await prepareGlmSession(options, {
    selection: {
      provider: input.provider,
      model: input.model,
    },
    shouldPassExplicitModel: true,
  });
  const result = await createAgentSessionFromServices({
    services,
    sessionManager,
    model,
    tools: options.tools,
    customTools: options.customTools,
  });

  return {
    ...result,
    session: wrapSessionWithApprovalPolicy(
      result.session,
      input.approvalPolicy,
    ) as typeof result.session,
    options,
  };
}

export async function createGlmRuntime(
  input: GlmSessionInput,
): Promise<AgentSessionRuntime> {
  const initialOptions = buildSessionOptions(input);
  let preferredSelection: GlmModelSelection = {
    provider: input.provider,
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

    const { services, model } = await prepareGlmSession(options, strategy);
    const result = await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
      model,
      tools: options.tools,
      customTools: options.customTools,
    });
    preferredSelection =
      getGlmModelSelection(result.session.model) ?? preferredSelection;

    return {
      ...result,
      services,
      diagnostics: services.diagnostics,
    };
  };

  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd: input.cwd,
    agentDir: initialOptions.agentDir,
    sessionManager: createGlmSessionManager(
      initialOptions.cwd,
      initialOptions.sessionDir,
    ),
  });

  const originalNewSession = runtime.newSession.bind(runtime);
  runtime.newSession = async (options) => {
    preferredSelection =
      getGlmModelSelection(runtime.session.model) ?? preferredSelection;
    return originalNewSession(options);
  };

  return wrapRuntimeWithApprovalPolicy(runtime, input.approvalPolicy);
}
