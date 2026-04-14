import { afterEach, describe, expect, test, vi } from "vitest";
import { resolveRuntimeConfig } from "../../src/app/env.js";
import {
  fileSystem,
  normalizeConfigFile,
  readConfigFile,
} from "../../src/app/config-store.js";

describe("resolveRuntimeConfig", () => {
  test("prefers cli flags over env and file config", () => {
    const config = resolveRuntimeConfig(
      { provider: "glm", model: "glm-5", yolo: true },
      {
        GLM_PROVIDER: "openai-compatible",
        GLM_MODEL: "glm-4.5",
      },
      {
        defaultProvider: "openai-compatible",
        defaultModel: "foo",
        approvalPolicy: "ask",
        providers: { glm: { apiKey: "k", baseURL: "" }, "openai-compatible": { apiKey: "", baseURL: "" } },
      },
    );

    expect(config.provider).toBe("glm");
    expect(config.model).toBe("glm-5");
    expect(config.approvalPolicy).toBe("never");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("config store normalization", () => {
  test("normalizeConfigFile returns independent provider configs", () => {
    const first = normalizeConfigFile();
    const second = normalizeConfigFile();

    expect(first.providers.glm).not.toBe(second.providers.glm);
    first.providers.glm.apiKey = "mutated";
    expect(second.providers.glm.apiKey).toBe("");
  });

  test("readConfigFile surfaces parse errors instead of silently defaulting", async () => {
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce("not json");
    await expect(readConfigFile()).rejects.toThrow(SyntaxError);
  });

  test("readConfigFile defaults when config file is missing", async () => {
    const enoent = new Error("missing file") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    vi.spyOn(fileSystem, "readFile").mockRejectedValueOnce(enoent);

    const config = await readConfigFile();
    expect(config.defaultProvider).toBe("glm");
    expect(config.defaultModel).toBe("glm-5.1");
    expect(config.providers.glm.apiKey).toBe("");
  });

  test("readConfigFile rejects legacy defaultProvider values", async () => {
    const payload = JSON.stringify({
      defaultProvider: "glm-official",
      defaultModel: "glm-5.1",
      approvalPolicy: "ask",
      providers: {
        glm: { apiKey: "", baseURL: "" },
        "openai-compatible": { apiKey: "", baseURL: "" },
      },
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);

    await expect(readConfigFile()).rejects.toThrow(/default provider/i);
  });

  test("readConfigFile rejects invalid default provider names", async () => {
    const payload = JSON.stringify({
      defaultProvider: "bad-provider",
      approvalPolicy: "ask",
      providers: {
        glm: { apiKey: "", baseURL: "" },
        "openai-compatible": { apiKey: "", baseURL: "" },
      },
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);
    await expect(readConfigFile()).rejects.toThrow(/default provider/i);
  });

  test("readConfigFile rejects persisted default providers not backed by storage", async () => {
    const payload = JSON.stringify({
      defaultProvider: "anthropic",
      approvalPolicy: "ask",
      providers: {
        glm: { apiKey: "", baseURL: "" },
        "openai-compatible": { apiKey: "", baseURL: "" },
      },
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);
    await expect(readConfigFile()).rejects.toThrow(/default provider/i);
  });

  test("readConfigFile rejects non-string defaultModel values", async () => {
    const payload = JSON.stringify({
      defaultProvider: "glm",
      defaultModel: 123,
      approvalPolicy: "ask",
      providers: {
        glm: { apiKey: "", baseURL: "" },
        "openai-compatible": { apiKey: "", baseURL: "" },
      },
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);
    await expect(readConfigFile()).rejects.toThrow(/defaultModel/i);
  });

  test("readConfigFile rejects invalid approval policies", async () => {
    const payload = JSON.stringify({
      defaultProvider: "glm",
      approvalPolicy: "oops",
      providers: {
        glm: { apiKey: "", baseURL: "" },
        "openai-compatible": { apiKey: "", baseURL: "" },
      },
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);
    await expect(readConfigFile()).rejects.toThrow(/approval policy/i);
  });

  test("readConfigFile rejects non-string provider fields", async () => {
    const payload = JSON.stringify({
      defaultProvider: "glm",
      approvalPolicy: "ask",
      providers: {
        glm: { apiKey: 123, baseURL: "https://ok" },
        "openai-compatible": { apiKey: "", baseURL: {} },
      },
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);

    await expect(readConfigFile()).rejects.toThrow(/apiKey/);
  });

  test("readConfigFile rejects non-string baseURL values", async () => {
    const payload = JSON.stringify({
      defaultProvider: "glm",
      approvalPolicy: "ask",
      providers: {
        glm: { apiKey: "", baseURL: 123 },
        "openai-compatible": { apiKey: "", baseURL: "" },
      },
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);

    await expect(readConfigFile()).rejects.toThrow(/baseURL/i);
  });
});
