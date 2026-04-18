import { describe, expect, test } from "vitest";
import { runDoctor } from "../../src/commands/doctor.js";
import { getDefaultConfigFile } from "../../src/app/config-store.js";

describe("runDoctor", () => {
  const baseConfig = getDefaultConfigFile();
  const stubReadConfigFile = async () => baseConfig;
  const baseOptions = {
    cwd: "/tmp/repo",
    env: {},
    cli: { provider: undefined, model: undefined, yolo: false },
    agentDir: "/tmp/.glm/agent",
    readConfigFile: stubReadConfigFile,
    pathExists: async () => true,
  } as const;

  test("fails when default provider lacks credentials even if another provider has an api key", async () => {
    const configWithOpenAiKey = {
      ...baseConfig,
      providers: {
        ...baseConfig.providers,
        "openai-compatible": { apiKey: "openai-key", baseURL: "https://example.com" },
      },
    };

    const result = await runDoctor({
      ...baseOptions,
      env: {},
      readConfigFile: async () => configWithOpenAiKey,
    });

    const credentialsCheck = result.checks.find((check) => check.id === "credentials");
    expect(credentialsCheck).toBeDefined();
    expect(credentialsCheck?.ok).toBe(false);
  });

  test("reports missing resources without failing the overall status", async () => {
    const result = await runDoctor({
      ...baseOptions,
      env: { GLM_API_KEY: "secret" },
      pathExists: async (path) => path === baseOptions.cwd,
    });

    const resourceCheck = result.checks.find((check) => check.id === "resources");
    expect(resourceCheck).toBeDefined();
    expect(resourceCheck?.ok).toBe(true);
    expect(resourceCheck?.details).toContain("prompts not synced yet");
  });

  test("treats whitespace-only GLM_API_KEY as missing for glm", async () => {
    const result = await runDoctor({
      ...baseOptions,
      env: { GLM_API_KEY: "   " },
    });

    const credentialsCheck = result.checks.find((check) => check.id === "credentials");
    expect(credentialsCheck?.ok).toBe(false);
    expect(credentialsCheck?.details).toContain("missing GLM_API_KEY");
  });

  test("treats whitespace-only OPENAI_API_KEY as missing for openai-compatible", async () => {
    const result = await runDoctor({
      ...baseOptions,
      cli: { provider: "openai-compatible", model: undefined, yolo: false },
      env: { OPENAI_API_KEY: "   " },
    });

    const credentialsCheck = result.checks.find((check) => check.id === "credentials");
    expect(credentialsCheck?.ok).toBe(false);
    expect(credentialsCheck?.details).toContain("missing OPENAI_API_KEY");
  });



  test("treats whitespace-only OPENAI_API_KEY as missing for openai-responses", async () => {
    const result = await runDoctor({
      ...baseOptions,
      cli: { provider: "openai-responses", model: undefined, yolo: false },
      env: { OPENAI_API_KEY: "   " },
    });

    const credentialsCheck = result.checks.find((check) => check.id === "credentials");
    expect(credentialsCheck?.ok).toBe(false);
    expect(credentialsCheck?.details).toContain("missing OPENAI_API_KEY");
  });
  test("treats whitespace-only ANTHROPIC_AUTH_TOKEN as missing for anthropic mode", async () => {
    const result = await runDoctor({
      ...baseOptions,
      cli: { provider: "anthropic", model: undefined, yolo: false },
      env: { ANTHROPIC_AUTH_TOKEN: "   " },
    });

    const credentialsCheck = result.checks.find((check) => check.id === "credentials");
    expect(credentialsCheck?.ok).toBe(false);
    expect(credentialsCheck?.details).toContain("missing ANTHROPIC_AUTH_TOKEN");
  });

  test("includes a runtime snapshot summary", async () => {
    const result = await runDoctor({
      ...baseOptions,
      env: { GLM_API_KEY: "secret" },
    });

    expect(result.status).toMatchObject({
      provider: "glm",
      model: "glm-5.1",
      diagnostics: {
        debugRuntime: false,
        eventLogLimit: 200,
      },
    });
  });
});
