import { afterEach, expect, test, vi } from "vitest";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalCwd = process.cwd();
const trackedEnvKeys = [
  "GLM_MODEL",
  "OPENAI_MODEL",
  "ANTHROPIC_MODEL",
  "GLM_APPROVAL_POLICY",
] as const;

const originalEnv = Object.fromEntries(
  trackedEnvKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof trackedEnvKeys)[number], string | undefined>;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();

  if (process.cwd() !== originalCwd) {
    process.chdir(originalCwd);
  }

  for (const key of trackedEnvKeys) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test("uses ~/.glm/agent and never policy when yolo is enabled", async () => {
  const { buildSessionOptions } = await import("../../src/session/create-session.js");
  const options = buildSessionOptions({
    cwd: "/tmp/demo",
    model: "glm-5",
    provider: "glm-official",
    approvalPolicy: "never",
  });

  expect(options.agentDir.endsWith("/.glm/agent")).toBe(true);
  expect(options.customTools.length).toBeGreaterThan(0);
});

test("createGlmSession resolves the requested model explicitly and restores model env", async () => {
  const requestedModel = {
    provider: "openai-compatible",
    id: "glm-openai-test",
  };

  const createAgentSessionFromServices = vi.fn(async (options: { model?: unknown }) => ({
    session: { model: options.model },
    extensionsResult: { extensions: [], errors: [], runtime: {} },
    modelFallbackMessage: undefined,
  }));

  const modelRegistry = {
    find: vi.fn((provider: string, modelId: string) => {
      if (
        provider === requestedModel.provider &&
        modelId === requestedModel.id
      ) {
        return requestedModel;
      }
      return undefined;
    }),
  };

  const createGlmServices = vi.fn(async () => {
    expect(process.env.OPENAI_MODEL).toBe(requestedModel.id);
    expect(process.env.GLM_MODEL).toBeUndefined();
    expect(process.env.ANTHROPIC_MODEL).toBeUndefined();

    return {
      services: {
        cwd: "/tmp/demo",
        agentDir: "/tmp/demo/.glm/agent",
        authStorage: {},
        settingsManager: {},
        modelRegistry,
        resourceLoader: {},
        diagnostics: [],
      },
      sessionManager: {},
    };
  });

  vi.doMock("@mariozechner/pi-coding-agent", async () => {
    const actual = await vi.importActual<typeof import("@mariozechner/pi-coding-agent")>(
      "@mariozechner/pi-coding-agent",
    );

    return {
      ...actual,
      createAgentSessionFromServices,
    };
  });

  vi.doMock("../../src/session/managers.js", () => ({
    createGlmServices,
    createGlmSessionManager: vi.fn(),
  }));
  vi.doMock("../../src/app/resource-sync.js", () => ({
    syncPackagedResources: vi.fn().mockResolvedValue(undefined),
  }));

  process.env.OPENAI_MODEL = "outside-openai";
  process.env.GLM_MODEL = "outside-glm";
  delete process.env.ANTHROPIC_MODEL;

  const { createGlmSession } = await import("../../src/session/create-session.js");

  await createGlmSession({
    cwd: "/tmp/demo",
    model: requestedModel.id,
    provider: "openai-compatible",
    approvalPolicy: "never",
  });

  expect(createAgentSessionFromServices).toHaveBeenCalledWith(
    expect.objectContaining({
      model: requestedModel,
    }),
  );
  expect(process.env.OPENAI_MODEL).toBe("outside-openai");
  expect(process.env.GLM_MODEL).toBe("outside-glm");
  expect(process.env.ANTHROPIC_MODEL).toBeUndefined();
});

test("runtime model strategy preserves selection for initial/new sessions but defers to saved resume state", async () => {
  const { getGlmModelSelection, resolveRuntimeModelStrategy } = await import("../../src/session/create-session.js");

  const initial = resolveRuntimeModelStrategy(
    {
      provider: "openai-compatible",
      model: "glm-openai-test",
    },
    {
      buildSessionContext: () => ({
        messages: [],
        thinkingLevel: "medium",
        model: null,
      }),
    },
  );

  expect(initial.selection).toEqual({
    provider: "openai-compatible",
    model: "glm-openai-test",
  });
  expect(initial.shouldPassExplicitModel).toBe(true);

  const currentBuiltInSelection = getGlmModelSelection({
    provider: "openai",
    id: "gpt-5",
  });

  expect(currentBuiltInSelection).toEqual({
    provider: "openai",
    model: "gpt-5",
  });

  const resumed = resolveRuntimeModelStrategy(
    {
      provider: "openai-compatible",
      model: "glm-openai-test",
    },
    {
      buildSessionContext: () => ({
        messages: [{ role: "user", content: "hi" }],
        thinkingLevel: "medium",
        model: {
          provider: "openai-compatible",
          modelId: "saved-session-model",
        },
      }),
    },
    { type: "session_start", reason: "resume" },
  );

  expect(resumed.selection).toEqual({
    provider: "openai-compatible",
    model: "saved-session-model",
  });
  expect(resumed.shouldPassExplicitModel).toBe(false);

  const freshNewSession = resolveRuntimeModelStrategy(
    currentBuiltInSelection!,
    {
      buildSessionContext: () => ({
        messages: [],
        thinkingLevel: "medium",
        model: null,
      }),
    },
    { type: "session_start", reason: "new" },
  );

  expect(freshNewSession.selection).toEqual({
    provider: "openai",
    model: "gpt-5",
  });
  expect(freshNewSession.shouldPassExplicitModel).toBe(true);

  const emptyResume = resolveRuntimeModelStrategy(
    {
      provider: "openai-compatible",
      model: "glm-openai-test",
    },
    {
      buildSessionContext: () => ({
        messages: [],
        thinkingLevel: "medium",
        model: null,
      }),
    },
    { type: "session_start", reason: "resume" },
  );

  expect(emptyResume.selection).toBeUndefined();
  expect(emptyResume.shouldPassExplicitModel).toBe(false);
});

test("runRunCommand restores cwd and approval env after runtime execution", async () => {
  const startingDir = mkdtempSync(join(tmpdir(), "glm-start-"));
  const targetDir = mkdtempSync(join(tmpdir(), "glm-target-"));
  const resolvedStartingDir = realpathSync(startingDir);
  const resolvedTargetDir = realpathSync(targetDir);
  process.chdir(startingDir);
  process.env.GLM_APPROVAL_POLICY = "keep-policy";

  const createGlmRuntime = vi.fn(async (input: { cwd: string }) => {
    process.chdir(input.cwd);
    return { runtime: true };
  });
  const runSingleTask = vi.fn(async () => {
    expect(process.cwd()).toBe(resolvedTargetDir);
    expect(process.env.GLM_APPROVAL_POLICY).toBe("never");
    return 0;
  });

  vi.doMock("../../src/app/config-store.js", () => ({
    readConfigFile: vi.fn().mockResolvedValue({
      defaultProvider: "glm-official",
      defaultModel: "glm-5",
      approvalPolicy: "ask",
      providers: {
        glmOfficial: { apiKey: "", baseURL: "" },
        openAICompatible: { apiKey: "", baseURL: "" },
      },
    }),
  }));
  vi.doMock("../../src/session/create-session.js", async () => {
    const actual = await vi.importActual<typeof import("../../src/session/create-session.js")>(
      "../../src/session/create-session.js",
    );

    return {
      ...actual,
      createGlmRuntime,
    };
  });
  vi.doMock("../../src/runtime/run-runtime.js", () => ({
    runSingleTask,
  }));

  const { runRunCommand } = await import("../../src/commands/run.js");

  await runRunCommand({
    cwd: targetDir,
    task: "demo task",
    yolo: true,
  });

  expect(runSingleTask).toHaveBeenCalled();
  expect(process.cwd()).toBe(resolvedStartingDir);
  expect(process.env.GLM_APPROVAL_POLICY).toBe("keep-policy");
});
