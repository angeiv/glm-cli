import { afterEach, expect, test, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

test("createGlmServices injects the prompt stack through resource loader overrides", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "glm-managers-cwd-"));
  const agentDir = mkdtempSync(join(tmpdir(), "glm-managers-agent-"));

  writeFileSync(
    join(cwd, "package.json"),
    JSON.stringify({
      packageManager: "pnpm@10.33.0",
      type: "module",
    }),
    "utf8",
  );
  mkdirSync(join(agentDir, "prompts"), { recursive: true });
  writeFileSync(join(agentDir, "prompts", "system.md"), "You are glm.\n", "utf8");

  const createAgentSessionServices = vi.fn(async (options: any) => {
    expect(options.resourceLoaderOptions.systemPromptOverride()).toContain("You are glm");
    expect(options.resourceLoaderOptions.appendSystemPromptOverride([]).join("\n\n")).toContain(
      "Execution lane: standard",
    );
    expect(options.resourceLoaderOptions.appendSystemPromptOverride([]).join("\n\n")).toContain(
      "Use pnpm",
    );
    expect(options.resourceLoaderOptions.extensionFactories).toEqual([
      expect.any(Function),
      expect.any(Function),
    ]);
    const [, registerDashscopeExtension] = options.resourceLoaderOptions.extensionFactories;
    const handlers = new Map<string, (...args: any[]) => unknown>();
    registerDashscopeExtension({
      on: (event: string, handler: (...args: any[]) => unknown) => {
        handlers.set(event, handler);
      },
    });
    const patchedPayload = handlers.get("before_provider_request")?.(
      {
        payload: {
          model: "glm-5.1",
          max_completion_tokens: 32000,
          reasoning_effort: "xhigh",
        },
      },
      {
        model: {
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/",
          maxTokens: 32000,
        },
      },
    ) as Record<string, unknown>;
    expect(patchedPayload.thinking_budget).toBe(31999);
    expect(patchedPayload).not.toHaveProperty("reasoning_effort");

    return {
      cwd: options.cwd,
      agentDir: options.agentDir,
      authStorage: {},
      settingsManager: {},
      modelRegistry: {},
      resourceLoader: {},
      diagnostics: [],
    };
  });

  vi.doMock("@mariozechner/pi-coding-agent", async () => {
    const actual = await vi.importActual<typeof import("@mariozechner/pi-coding-agent")>(
      "@mariozechner/pi-coding-agent",
    );

    return {
      ...actual,
      createAgentSessionServices,
    };
  });

  vi.doMock("../../src/app/config-store.js", async () => {
    const actual = await vi.importActual<typeof import("../../src/app/config-store.js")>(
      "../../src/app/config-store.js",
    );

    return {
      ...actual,
      readConfigFile: vi.fn(async () => actual.normalizeConfigFile()),
    };
  });

  const { createGlmServices } = await import("../../src/session/managers.js");

  await createGlmServices({
    cwd,
    agentDir,
    sessionDir: join(agentDir, "sessions"),
    authPath: join(agentDir, "auth.json"),
    modelsPath: join(agentDir, "models.json"),
    provider: "bigmodel-coding",
    api: "openai-compatible",
    model: "glm-5.1",
    promptMode: "standard",
  });

  expect(createAgentSessionServices).toHaveBeenCalledTimes(1);
});
