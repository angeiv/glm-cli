import { describe, expect, test, vi } from "vitest";
import { authLogin, authLogout, authStatus } from "../../src/commands/auth.js";
import { getDefaultConfigFile } from "../../src/app/config-store.js";

describe("authLogin", () => {
  test("persists glm credentials from sequential prompts", async () => {
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
          glm: expect.objectContaining({
            apiKey: "glm-secret",
          }),
        }),
      }),
    );
    expect(log).toHaveBeenCalledWith("Credentials saved for provider glm.");
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
          "openai-compatible": expect.objectContaining({
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
          glm: { apiKey: "glm-secret", baseURL: "" },
          "openai-compatible": { apiKey: "", baseURL: "" },
        },
      }),
      env: { ANTHROPIC_AUTH_TOKEN: "anthropic-token" },
    });

    expect(log).toHaveBeenCalledWith("glm: configured");
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
          glm: { apiKey: "glm-secret", baseURL: "https://glm.example.com" },
          "openai-compatible": { apiKey: "openai-secret", baseURL: "https://gateway.example.com" },
        },
      }),
      writeConfigFile,
      log,
    });

    expect(writeConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: {
          glm: {
            apiKey: "",
            baseURL: "https://glm.example.com",
          },
          "openai-compatible": {
            apiKey: "",
            baseURL: "https://gateway.example.com",
          },
        },
      }),
    );
    expect(log).toHaveBeenCalledWith("Stored credentials cleared for glm and openai-compatible.");
  });
});
