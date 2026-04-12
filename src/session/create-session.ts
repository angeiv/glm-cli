import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  type AgentSessionRuntime,
  type CreateAgentSessionResult,
  type CreateAgentSessionRuntimeFactory,
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

function applyRuntimeEnvironment(options: GlmSessionInput): void {
  process.env.GLM_APPROVAL_POLICY = options.approvalPolicy;
  process.env.GLM_MODEL = options.model;

  if (options.provider === "openai-compatible") {
    process.env.OPENAI_MODEL = options.model;
  }

  if (options.provider === "anthropic") {
    process.env.ANTHROPIC_MODEL = options.model;
  }
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

  await syncPackagedResources(options.agentDir);
  applyRuntimeEnvironment(options);

  const { services, sessionManager } = await createGlmServices(options);
  const result = await createAgentSessionFromServices({
    services,
    sessionManager,
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

    await syncPackagedResources(options.agentDir);
    applyRuntimeEnvironment(options);

    const { services } = await createGlmServices(options);
    const result = await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
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
