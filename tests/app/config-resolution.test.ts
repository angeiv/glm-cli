import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildCapabilityEnvironment,
  buildNotificationEnvironment,
  resolveRuntimeConfig,
} from "../../src/app/env.js";
import {
  fileSystem,
  getDefaultConfigFile,
  normalizeConfigFile,
  readConfigFile,
} from "../../src/app/config-store.js";

describe("resolveRuntimeConfig", () => {
  test("prefers cli flags over env and file config", () => {
    const config = resolveRuntimeConfig(
      { provider: "bigmodel", api: "anthropic", model: "glm-5", yolo: true },
      {
        GLM_PROVIDER: "custom",
        GLM_API: "openai-compatible",
        GLM_MODEL: "glm-4.5",
      },
      {
        ...getDefaultConfigFile(),
        defaultProvider: "openrouter",
        defaultApi: "openai-responses",
        defaultModel: "foo",
      },
    );

    expect(config.provider).toBe("bigmodel");
    expect(config.api).toBe("anthropic");
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

    expect(first.providers["bigmodel-coding"]).not.toBe(second.providers["bigmodel-coding"]);
    first.providers["bigmodel-coding"].apiKey = "mutated";
    expect(second.providers["bigmodel-coding"].apiKey).toBe("");
  });

  test("normalizeConfigFile returns independent capability configs", () => {
    const first = normalizeConfigFile();
    const second = normalizeConfigFile();

    expect(first.generation).not.toBe(second.generation);
    expect(first.glmCapabilities).not.toBe(second.glmCapabilities);
    expect(first.modelDiscovery).not.toBe(second.modelDiscovery);
    expect(first.loop).not.toBe(second.loop);
    expect(first.notifications).not.toBe(second.notifications);
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
    expect(config.defaultProvider).toBe("bigmodel-coding");
    expect(config.defaultApi).toBe("openai-compatible");
    expect(config.defaultModel).toBe("glm-5.1");
    expect(config.providers["bigmodel-coding"].apiKey).toBe("");
  });

  test("readConfigFile canonicalizes legacy defaultProvider values", async () => {
    const payload = JSON.stringify({
      defaultProvider: "glm",
      defaultModel: "glm-5.1",
      approvalPolicy: "ask",
      providers: {
        glm: { apiKey: "", baseURL: "" },
        "openai-compatible": { apiKey: "", baseURL: "https://gateway.example.com" },
      },
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);

    const config = await readConfigFile();
    expect(config.defaultProvider).toBe("bigmodel-coding");
    expect(config.defaultApi).toBe("openai-compatible");
    expect(config.providers.custom.baseURL).toBe("https://gateway.example.com");
  });

  test("readConfigFile canonicalizes legacy protocol providers to custom + defaultApi", async () => {
    const payload = JSON.stringify({
      defaultProvider: "openai-responses",
      approvalPolicy: "ask",
      providers: {
        "openai-compatible": { apiKey: "key", baseURL: "https://gateway.example.com" },
      },
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);

    const config = await readConfigFile();
    expect(config.defaultProvider).toBe("custom");
    expect(config.defaultApi).toBe("openai-responses");
    expect(config.providers.custom.apiKey).toBe("key");
  });

  test("readConfigFile rejects invalid default provider names", async () => {
    const payload = JSON.stringify({
      defaultProvider: "bad-provider",
      approvalPolicy: "ask",
      providers: {},
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);
    await expect(readConfigFile()).rejects.toThrow(/default provider/i);
  });

  test("readConfigFile validates provider config field types", async () => {
    const payload = JSON.stringify({
      defaultProvider: "bigmodel-coding",
      approvalPolicy: "ask",
      providers: {
        "bigmodel-coding": { apiKey: 123, baseURL: "https://ok" },
      },
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);
    await expect(readConfigFile()).rejects.toThrow(/apiKey/i);
  });

  test("readConfigFile reads modelOverrides as the primary override surface", async () => {
    const payload = JSON.stringify({
      defaultProvider: "bigmodel-coding",
      approvalPolicy: "ask",
      providers: {},
      modelOverrides: [
        {
          match: {
            provider: "custom",
            api: "anthropic",
            baseUrl: "*modelscope.cn*",
            modelId: "ZhipuAI/GLM-5*",
          },
          canonicalModelId: "glm-5",
        },
      ],
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);

    const config = await readConfigFile();
    expect(config.modelOverrides?.[0]).toMatchObject({
      match: {
        provider: "custom",
        api: "anthropic",
      },
      canonicalModelId: "glm-5",
    });
  });

  test("readConfigFile keeps legacy modelProfiles.overrides compatible", async () => {
    const payload = JSON.stringify({
      defaultProvider: "bigmodel-coding",
      approvalPolicy: "ask",
      providers: {},
      modelProfiles: {
        overrides: [
          {
            match: {
              provider: "custom",
              api: "anthropic",
              baseUrl: "*modelscope.cn*",
              modelId: "ZhipuAI/GLM-5*",
            },
            canonicalModelId: "glm-5",
          },
        ],
      },
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);

    const config = await readConfigFile();
    expect(config.modelOverrides?.[0]).toMatchObject({
      match: {
        provider: "custom",
        api: "anthropic",
      },
      canonicalModelId: "glm-5",
    });
  });

  test("readConfigFile rejects invalid provider api values", async () => {
    const payload = JSON.stringify({
      defaultProvider: "custom",
      approvalPolicy: "ask",
      providers: {
        custom: { apiKey: "", baseURL: "", api: "weird" },
      },
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);

    await expect(readConfigFile()).rejects.toThrow(/Invalid api/i);
  });

  test("readConfigFile validates model discovery settings", async () => {
    const payload = JSON.stringify({
      defaultProvider: "custom",
      approvalPolicy: "ask",
      modelDiscovery: {
        enabled: true,
        cacheTtlMs: 0,
      },
      providers: {
        custom: { apiKey: "", baseURL: "" },
      },
    });
    vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(payload);

    await expect(readConfigFile()).rejects.toThrow(/modelDiscovery\.cacheTtlMs/i);
  });

  test("buildCapabilityEnvironment prefers explicit env and falls back to config", () => {
    const env = buildCapabilityEnvironment(
      {
        GLM_MAX_OUTPUT_TOKENS: "4096",
        GLM_TEMPERATURE: "0.8",
      },
      {
        ...getDefaultConfigFile(),
        generation: {
          maxOutputTokens: 2048,
          temperature: 0.2,
          topP: 0.95,
        },
        glmCapabilities: {
          thinkingMode: "enabled",
          clearThinking: false,
          toolStream: "on",
          responseFormat: "json_object",
          contextCache: "explicit",
        },
      },
    );

    expect(env).toMatchObject({
      GLM_MAX_OUTPUT_TOKENS: "4096",
      GLM_TEMPERATURE: "0.8",
      GLM_TOP_P: "0.95",
      GLM_THINKING_MODE: "enabled",
      GLM_CLEAR_THINKING: "0",
      GLM_TOOL_STREAM: "on",
      GLM_RESPONSE_FORMAT: "json_object",
      GLM_CONTEXT_CACHE: "explicit",
    });
  });

  test("buildNotificationEnvironment serializes notification toggles", () => {
    const env = buildNotificationEnvironment(
      {},
      {
        ...getDefaultConfigFile(),
        notifications: {
          enabled: true,
          onTurnEnd: false,
          onLoopResult: true,
        },
      },
    );

    expect(env).toEqual({
      GLM_NOTIFY_ENABLED: "1",
      GLM_NOTIFY_ON_TURN_END: "0",
      GLM_NOTIFY_ON_LOOP_RESULT: "1",
    });
  });
});
