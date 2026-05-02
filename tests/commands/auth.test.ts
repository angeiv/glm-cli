import { describe, expect, test, vi } from "vitest";
import { authLogin, authLogout, authStatus } from "../../src/commands/auth.js";
import { getDefaultConfigFile } from "../../src/app/config-store.js";

describe("authLogin", () => {
  test("persists bigmodel-coding credentials from sequential prompts", async () => {
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
          "bigmodel-coding": expect.objectContaining({
            apiKey: "glm-secret",
          }),
        }),
      }),
    );
    expect(log).toHaveBeenCalledWith("Credentials saved for provider bigmodel-coding.");
  });

  test("persists custom credentials and base URL", async () => {
    const prompts = ["custom", "openai-secret", "https://gateway.example.com"];
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
          custom: expect.objectContaining({
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
          ...getDefaultConfigFile().providers,
          "bigmodel-coding": { apiKey: "glm-secret", baseURL: "" },
          custom: { apiKey: "", baseURL: "" },
        },
      }),
      env: { ANTHROPIC_AUTH_TOKEN: "anthropic-token" },
    });

    expect(log).toHaveBeenCalledWith("bigmodel-coding: configured");
    expect(log).toHaveBeenCalledWith("custom: missing");
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
          ...getDefaultConfigFile().providers,
          "bigmodel-coding": { apiKey: "glm-secret", baseURL: "https://glm.example.com" },
          custom: { apiKey: "openai-secret", baseURL: "https://gateway.example.com" },
        },
      }),
      writeConfigFile,
      log,
    });

    expect(writeConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.objectContaining({
          "bigmodel-coding": {
            apiKey: "",
            baseURL: "https://glm.example.com",
          },
          custom: {
            apiKey: "",
            baseURL: "https://gateway.example.com",
          },
        }),
      }),
    );
    expect(log).toHaveBeenCalledWith("Stored credentials cleared for bigmodel-coding and custom.");
  });
});
