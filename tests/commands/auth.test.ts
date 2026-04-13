import { describe, expect, test, vi } from "vitest";
import { authLogin, authLogout, authStatus } from "../../src/commands/auth.js";
import { getDefaultConfigFile } from "../../src/app/config-store.js";

describe("authLogin", () => {
  test("persists glm-official credentials from sequential prompts", async () => {
    const prompts = ["", "glm-secret", ""];
    const writeConfigFile = vi.fn(async () => undefined);
    const log = vi.fn();

    await authLogin({
      prompt: async () => prompts.shift() ?? "",
      readConfigFile: async () => getDefaultConfigFile(),
      writeConfigFile,
      log,
    });

    expect(writeConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.objectContaining({
          glmOfficial: expect.objectContaining({
            apiKey: "glm-secret",
          }),
        }),
      }),
    );
    expect(log).toHaveBeenCalledWith("Credentials saved for provider glm-official.");
  });

  test("persists openai-compatible credentials and base URL", async () => {
    const prompts = ["openai-compatible", "openai-secret", "https://gateway.example.com"];
    const writeConfigFile = vi.fn(async () => undefined);

    await authLogin({
      prompt: async () => prompts.shift() ?? "",
      readConfigFile: async () => getDefaultConfigFile(),
      writeConfigFile,
      log: vi.fn(),
    });

    expect(writeConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.objectContaining({
          openAICompatible: expect.objectContaining({
            apiKey: "openai-secret",
            baseURL: "https://gateway.example.com",
          }),
        }),
      }),
    );
  });
});

describe("authStatus", () => {
  test("logs whether each provider credential source is configured", async () => {
    const log = vi.fn();
    await authStatus({
      log,
      readConfigFile: async () => ({
        ...getDefaultConfigFile(),
        providers: {
          glmOfficial: { apiKey: "glm-secret", baseURL: "" },
          openAICompatible: { apiKey: "", baseURL: "" },
        },
      }),
      env: { ANTHROPIC_AUTH_TOKEN: "anthropic-token" },
    });

    expect(log).toHaveBeenCalledWith("glm-official: configured");
    expect(log).toHaveBeenCalledWith("openai-compatible: missing");
    expect(log).toHaveBeenCalledWith("anthropic (env): configured");
  });
});

describe("authLogout", () => {
  test("clears persisted API keys for supported storage providers", async () => {
    const writeConfigFile = vi.fn(async () => undefined);
    const log = vi.fn();

    await authLogout({
      readConfigFile: async () => ({
        ...getDefaultConfigFile(),
        providers: {
          glmOfficial: { apiKey: "glm-secret", baseURL: "https://glm.example.com" },
          openAICompatible: { apiKey: "openai-secret", baseURL: "https://gateway.example.com" },
        },
      }),
      writeConfigFile,
      log,
    });

    expect(writeConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: {
          glmOfficial: {
            apiKey: "",
            baseURL: "https://glm.example.com",
          },
          openAICompatible: {
            apiKey: "",
            baseURL: "https://gateway.example.com",
          },
        },
      }),
    );
    expect(log).toHaveBeenCalledWith("Stored credentials cleared for glm-official and openai-compatible.");
  });
});
