import { afterEach, describe, expect, test, vi } from "vitest";
import { buildCapabilityEnvironment, resolveRuntimeConfig } from "../../src/app/env.js";
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

  test("normalizeConfigFile returns independent capability configs", () => {
    const first = normalizeConfigFile();
    const second = normalizeConfigFile();

    expect(first.generation).not.toBe(second.generation);
    expect(first.glmCapabilities).not.toBe(second.glmCapabilities);
    expect(first.loop).not.toBe(second.loop);

    first.generation.maxOutputTokens = 4096;
    first.glmCapabilities.thinkingMode = "enabled";
    first.loop.maxRounds = 5;

    expect(second.generation.maxOutputTokens).toBeUndefined();
    expect(second.glmCapabilities.thinkingMode).toBe("auto");
    expect(second.loop.maxRounds).toBe(3);
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

  test("readConfigFile rejects non-string endpoint values", async () => {
    const payload = JSON.stringify({
      defaultProvider: "glm",
      approvalPolicy: "ask",
      providers: {
        glm: { apiKey: "", baseURL: "", endpoint: 123 },
        "openai-compatible": { apiKey: "", baseURL: "" },
      },
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);

    await expect(readConfigFile()).rejects.toThrow(/endpoint/i);
  });

  test("readConfigFile rejects invalid glm capability values", async () => {
    const payload = JSON.stringify({
      defaultProvider: "glm",
      approvalPolicy: "ask",
      providers: {
        glm: { apiKey: "", baseURL: "" },
        "openai-compatible": { apiKey: "", baseURL: "" },
      },
      glmCapabilities: {
        thinkingMode: "max",
      },
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);

    await expect(readConfigFile()).rejects.toThrow(/thinkingMode/i);
  });

  test("readConfigFile rejects invalid loop config values", async () => {
    const payload = JSON.stringify({
      defaultProvider: "glm",
      approvalPolicy: "ask",
      providers: {
        glm: { apiKey: "", baseURL: "" },
        "openai-compatible": { apiKey: "", baseURL: "" },
      },
      loop: {
        maxRounds: 0,
      },
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);

    await expect(readConfigFile()).rejects.toThrow(/maxRounds/i);
  });

  test("readConfigFile rejects invalid diagnostics config values", async () => {
    const payload = JSON.stringify({
      defaultProvider: "glm",
      approvalPolicy: "ask",
      debugRuntime: "yes",
      eventLogLimit: 0,
      providers: {
        glm: { apiKey: "", baseURL: "" },
        "openai-compatible": { apiKey: "", baseURL: "" },
      },
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);

    await expect(readConfigFile()).rejects.toThrow(/debugRuntime|eventLogLimit/i);
  });

  test("buildCapabilityEnvironment prefers explicit env and falls back to config", () => {
    const config = normalizeConfigFile({
      generation: {
        maxOutputTokens: 4096,
        temperature: 0.2,
        topP: 0.9,
      },
      glmCapabilities: {
        thinkingMode: "enabled",
        clearThinking: false,
        toolStream: "on",
        responseFormat: "json_object",
      },
      providers: {
        glm: { apiKey: "", baseURL: "", endpoint: "bigmodel-coding" },
        "openai-compatible": { apiKey: "", baseURL: "" },
      },
    });

    const env = buildCapabilityEnvironment(
      {
        GLM_TEMPERATURE: "0.8",
      },
      config,
    );

    expect(env).toMatchObject({
      GLM_MAX_OUTPUT_TOKENS: "4096",
      GLM_TEMPERATURE: "0.8",
      GLM_TOP_P: "0.9",
      GLM_THINKING_MODE: "enabled",
      GLM_CLEAR_THINKING: "0",
      GLM_TOOL_STREAM: "on",
      GLM_RESPONSE_FORMAT: "json_object",
      GLM_ENDPOINT: "bigmodel-coding",
    });
  });
});
