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

  test("reads loop keys", async () => {
    const log = vi.fn();
    const value = await configGet("loopMaxRounds", {
      readConfigFile: async () => ({
        ...getDefaultConfigFile(),
        loop: {
          ...getDefaultConfigFile().loop,
          maxRounds: 5,
        },
      }),
      log,
    });

    expect(value).toBe("5");
    expect(log).toHaveBeenCalledWith("5");
  });

  test("reads diagnostics keys", async () => {
    const log = vi.fn();
    const value = await configGet("eventLogLimit", {
      readConfigFile: async () => ({
        ...getDefaultConfigFile(),
        eventLogLimit: 32,
      }),
      log,
    });

    expect(value).toBe("32");
    expect(log).toHaveBeenCalledWith("32");
  });

  test("reads hook keys", async () => {
    const log = vi.fn();
    const value = await configGet("hookTimeoutMs", {
      readConfigFile: async () => ({
        ...getDefaultConfigFile(),
        hooksEnabled: true,
        hookTimeoutMs: 8000,
      }),
      log,
    });

    expect(value).toBe("8000");
    expect(log).toHaveBeenCalledWith("8000");
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

  test("updates loop keys and persists them", async () => {
    const writeConfigFile = vi.fn(async () => undefined);

    const updated = await configSet("loopFailureMode", "fail", {
      readConfigFile: async () => getDefaultConfigFile(),
      writeConfigFile,
      log: vi.fn(),
    });

    expect(updated.loop.failureMode).toBe("fail");
    expect(writeConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        loop: expect.objectContaining({
          failureMode: "fail",
        }),
      }),
    );
  });

  test("updates diagnostics keys and persists them", async () => {
    const writeConfigFile = vi.fn(async () => undefined);

    const updated = await configSet("debugRuntime", "true", {
      readConfigFile: async () => getDefaultConfigFile(),
      writeConfigFile,
      log: vi.fn(),
    });

    expect(updated.debugRuntime).toBe(true);
    expect(writeConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        debugRuntime: true,
      }),
    );
  });
});
