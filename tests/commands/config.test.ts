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
});
