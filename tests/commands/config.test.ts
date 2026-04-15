import { describe, expect, test, vi } from "vitest";
import { configGet, configSet } from "../../src/commands/config.js";
import { getDefaultConfigFile } from "../../src/app/config-store.js";

describe("configGet", () => {
  test("logs the requested config value", async () => {
    const log = vi.fn();
    const value = await configGet("defaultModel", {
      readConfigFile: async () => ({
        ...getDefaultConfigFile(),
        defaultModel: "glm-5-air",
      }),
      log,
    });

    expect(value).toBe("glm-5-air");
    expect(log).toHaveBeenCalledWith("glm-5-air");
  });

  test("reads glm capability keys", async () => {
    const log = vi.fn();
    const value = await configGet("thinkingMode", {
      readConfigFile: async () => ({
        ...getDefaultConfigFile(),
        glmCapabilities: {
          thinkingMode: "enabled",
          clearThinking: false,
          toolStream: "on",
          responseFormat: "json_object",
        },
      }),
      log,
    });

    expect(value).toBe("enabled");
    expect(log).toHaveBeenCalledWith("enabled");
  });
});

describe("configSet", () => {
  test("updates a supported config key and persists it", async () => {
    const writeConfigFile = vi.fn(async () => undefined);
    const log = vi.fn();

    const updated = await configSet("approvalPolicy", "never", {
      readConfigFile: async () => getDefaultConfigFile(),
      writeConfigFile,
      log,
    });

    expect(updated.approvalPolicy).toBe("never");
    expect(writeConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalPolicy: "never",
      }),
    );
    expect(log).toHaveBeenCalledWith("Updated approvalPolicy=never");
  });

  test("updates GLM capability keys and persists them", async () => {
    const writeConfigFile = vi.fn(async () => undefined);
    const log = vi.fn();

    const updated = await configSet("toolStream", "on", {
      readConfigFile: async () => getDefaultConfigFile(),
      writeConfigFile,
      log,
    });

    expect(updated.glmCapabilities?.toolStream).toBe("on");
    expect(writeConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        glmCapabilities: expect.objectContaining({
          toolStream: "on",
        }),
      }),
    );
    expect(log).toHaveBeenCalledWith("Updated toolStream=on");
  });

  test("supports provider endpoint presets via config set", async () => {
    const writeConfigFile = vi.fn(async () => undefined);

    const updated = await configSet("glmEndpoint", "zai-coding", {
      readConfigFile: async () => getDefaultConfigFile(),
      writeConfigFile,
      log: vi.fn(),
    });

    expect(updated.providers.glm.endpoint).toBe("zai-coding");
  });
});
