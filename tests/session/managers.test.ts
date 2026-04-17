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

  writeFileSync(join(cwd, "package.json"), JSON.stringify({
    packageManager: "pnpm@10.33.0",
    type: "module",
  }), "utf8");
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
    provider: "glm",
    model: "glm-5.1",
    promptMode: "standard",
  });

  expect(createAgentSessionServices).toHaveBeenCalledTimes(1);
});
