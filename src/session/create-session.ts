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

const MODEL_SELECTION_ENV_KEYS = [
  "GLM_MODEL",
  "OPENAI_MODEL",
  "ANTHROPIC_MODEL",
] as const;

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
  input: Pick<GlmSessionInput, "provider" | "model">,
): Partial<NodeJS.ProcessEnv> {
  const overrides: Partial<NodeJS.ProcessEnv> = Object.fromEntries(
    MODEL_SELECTION_ENV_KEYS.map((key) => [key, undefined]),
  );

  if (input.provider === "openai-compatible") {
    overrides.OPENAI_MODEL = input.model;
  }

  return overrides;
}

export function resolveRequestedModel(
  modelRegistry: Pick<ModelRegistry, "find">,
  provider: ProviderName,
  modelId: string,
) {
  const model = modelRegistry.find(provider, modelId);

  if (!model) {
    throw new Error(`Requested model "${provider}/${modelId}" is not available`);
  }

  return model;
}

async function prepareGlmSession(
  options: GlmSessionOptions,
): Promise<{
  services: Awaited<ReturnType<typeof createGlmServices>>["services"];
  sessionManager: Awaited<ReturnType<typeof createGlmServices>>["sessionManager"];
  model: ReturnType<typeof resolveRequestedModel>;
}> {
  await syncPackagedResources(options.agentDir);

  return withScopedEnvironment(
    buildModelSelectionEnvironment(options),
    async () => {
      const { services, sessionManager } = await createGlmServices(options);
      const model = resolveRequestedModel(
        services.modelRegistry,
        options.provider,
        options.model,
      );

      return {
        services,
        sessionManager,
        model,
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
  const { services, sessionManager, model } = await prepareGlmSession(options);
  const result = await createAgentSessionFromServices({
    services,
    sessionManager,
    model,
    tools: options.tools,
    customTools: options.customTools,
  });

  return {
    ...result,
    options,
  };
}

export async function createGlmRuntime(
  input: GlmSessionInput,
): Promise<AgentSessionRuntime> {
  const initialOptions = buildSessionOptions(input);

  const createRuntime: CreateAgentSessionRuntimeFactory = async ({
    cwd,
    sessionManager,
    sessionStartEvent,
  }) => {
    const options = buildSessionOptions({
      ...input,
      cwd,
    });

    const { services, model } = await prepareGlmSession(options);
    const result = await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
      model,
      tools: options.tools,
      customTools: options.customTools,
    });

    return {
      ...result,
      services,
      diagnostics: services.diagnostics,
    };
  };

  return createAgentSessionRuntime(createRuntime, {
    cwd: input.cwd,
    agentDir: initialOptions.agentDir,
    sessionManager: createGlmSessionManager(
      initialOptions.cwd,
      initialOptions.sessionDir,
    ),
  });
}
