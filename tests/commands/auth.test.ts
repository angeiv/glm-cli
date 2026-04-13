import { describe, expect, test, vi } from "vitest";
import { authLogin } from "../../src/commands/auth.js";
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
