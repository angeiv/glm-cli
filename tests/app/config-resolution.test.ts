import { afterEach, describe, expect, test, vi } from "vitest";
import { resolveRuntimeConfig } from "../../src/app/env.js";
import {
  fileSystem,
  mapStorageKeyToProvider,
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
        providers: { glmOfficial: { apiKey: "k", baseURL: "" }, openAICompatible: { apiKey: "", baseURL: "" } },
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

    expect(first.providers.glmOfficial).not.toBe(second.providers.glmOfficial);
    first.providers.glmOfficial.apiKey = "mutated";
    expect(second.providers.glmOfficial.apiKey).toBe("");
  });

  test("mapStorageKeyToProvider returns stable runtime identifiers", () => {
    expect(mapStorageKeyToProvider("glmOfficial")).toBe("glm");
    expect(mapStorageKeyToProvider("openAICompatible")).toBe("openai-compatible");
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
    expect(config.providers.glmOfficial.apiKey).toBe("");
  });

  test("readConfigFile normalizes legacy defaultProvider values", async () => {
    const payload = JSON.stringify({
      defaultProvider: "glm-official",
      defaultModel: "glm-5.1",
      approvalPolicy: "ask",
      providers: {
        glmOfficial: { apiKey: "", baseURL: "" },
        openAICompatible: { apiKey: "", baseURL: "" },
      },
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);

    const config = await readConfigFile();
    expect(config.defaultProvider).toBe("glm");
  });

  test("readConfigFile rejects invalid default provider names", async () => {
    const payload = JSON.stringify({
      defaultProvider: "bad-provider",
      approvalPolicy: "ask",
      providers: {
        glmOfficial: { apiKey: "", baseURL: "" },
        openAICompatible: { apiKey: "", baseURL: "" },
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
        glmOfficial: { apiKey: "", baseURL: "" },
        openAICompatible: { apiKey: "", baseURL: "" },
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
        glmOfficial: { apiKey: "", baseURL: "" },
        openAICompatible: { apiKey: "", baseURL: "" },
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
        glmOfficial: { apiKey: "", baseURL: "" },
        openAICompatible: { apiKey: "", baseURL: "" },
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
        glmOfficial: { apiKey: 123, baseURL: "https://ok" },
        openAICompatible: { apiKey: "", baseURL: {} },
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
        glmOfficial: { apiKey: "", baseURL: 123 },
        openAICompatible: { apiKey: "", baseURL: "" },
      },
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);

    await expect(readConfigFile()).rejects.toThrow(/baseURL/i);
  });
});
