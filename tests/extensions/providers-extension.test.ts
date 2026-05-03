import { beforeEach, describe, expect, test, vi } from "vitest";

const readGlmUserConfigMock = vi.fn(() => ({}));
const readGlmModelProfileOverridesMock = vi.fn(() => []);
const resolveDiscoveredModelsMock = vi.fn();

type RegisteredProvider = {
  name: string;
  config: any;
};

type PiMock = {
  registerProvider: (name: string, config: any) => void;
};

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

vi.mock("../../resources/extensions/shared/glm-user-config.js", () => {
  return {
    readGlmUserConfig: readGlmUserConfigMock,
    readGlmModelProfileOverrides: readGlmModelProfileOverridesMock,
  };
});

vi.mock("../../src/models/model-discovery.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/models/model-discovery.js")>(
    "../../src/models/model-discovery.js",
  );

  return {
    ...actual,
    resolveDiscoveredModels: resolveDiscoveredModelsMock,
  };
});

describe("glm-providers extension", () => {
  beforeEach(() => {
    readGlmUserConfigMock.mockReturnValue({});
    readGlmModelProfileOverridesMock.mockReturnValue([]);
    resolveDiscoveredModelsMock.mockReset();
    resolveDiscoveredModelsMock.mockResolvedValue({
      models: [],
      status: {
        enabled: true,
        supported: true,
        source: "fallback",
      },
    });
  });

  test("enables zaiToolStream compat only for official providers that support tool streaming", async () => {
    process.env.GLM_PROVIDER = "bigmodel";
    process.env.GLM_API_KEY = "test-key";
    process.env.GLM_BASE_URL = "https://open.bigmodel.cn/api/paas/v4/";

    const providers: RegisteredProvider[] = [];
    const pi: PiMock = {
      registerProvider: (name, config) => {
        providers.push({ name, config });
      },
    };

    const { default: registerProvidersExtension } = await import(
      "../../resources/extensions/glm-providers/index.ts"
    );
    await registerProvidersExtension(pi as any);

    const provider = providers.find((p) => p.name === "bigmodel");
    expect(provider).toBeTruthy();

    const models = provider!.config.models as Array<{ id: string; compat?: any }>;
    expect(models.find((m) => m.id === "glm-5.1")?.compat?.zaiToolStream).toBe(true);
    expect(models.find((m) => m.id === "glm-4.5-air")?.compat?.zaiToolStream).toBe(false);
    expect(models.find((m) => m.id === "glm-4.6")?.compat?.zaiToolStream).toBe(true);
  });

  test("applies override-defined modalities to provider model registration", async () => {
    process.env.GLM_PROVIDER = "custom";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_BASE_URL = "https://gateway.example.com/v1";
    process.env.OPENAI_MODEL = "vendor/some-custom-model";
    readGlmModelProfileOverridesMock.mockReturnValue([
      {
        match: {
          provider: "custom",
          api: "openai-compatible",
          modelId: "vendor/some-custom-model",
        },
        modalities: ["text"],
      },
    ]);

    const providers: RegisteredProvider[] = [];
    const pi: PiMock = {
      registerProvider: (name, config) => {
        providers.push({ name, config });
      },
    };

    const { default: registerProvidersExtension } = await import(
      "../../resources/extensions/glm-providers/index.ts"
    );
    await registerProvidersExtension(pi as any);

    const provider = providers.find((p) => p.name === "custom");
    expect(provider).toBeTruthy();

    const model = (provider!.config.models as Array<{ id: string; input: string[] }>).find(
      (entry) => entry.id === "vendor/some-custom-model",
    );
    expect(model?.input).toEqual(["text"]);
  });

  test("registers discovered gateway models and applies discovered metadata overlays", async () => {
    process.env.GLM_PROVIDER = "custom";
    process.env.GLM_API = "openai-compatible";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_BASE_URL = "https://gateway.example.com/v1";
    process.env.OPENAI_MODEL = "manual-model";
    resolveDiscoveredModelsMock.mockResolvedValue({
      models: [
        {
          id: "glm-5.1",
          name: "GLM 5.1 via Gateway",
          caps: {
            contextWindow: 300_000,
            maxOutputTokens: 100_000,
            supportsThinking: true,
            defaultThinkingMode: "enabled",
          },
          modalities: ["text"],
        },
        {
          id: "qwen/qwen3.5-122b-a10b",
          caps: {
            contextWindow: 1_000_000,
            maxOutputTokens: 65_536,
          },
          modalities: ["text", "image"],
        },
      ],
      status: {
        enabled: true,
        supported: true,
        source: "live",
        modelCount: 2,
      },
    });

    const providers: RegisteredProvider[] = [];
    const pi: PiMock = {
      registerProvider: (name, config) => {
        providers.push({ name, config });
      },
    };

    const { default: registerProvidersExtension } = await import(
      "../../resources/extensions/glm-providers/index.ts"
    );
    await registerProvidersExtension(pi as any);

    expect(resolveDiscoveredModelsMock).toHaveBeenCalledTimes(1);

    const provider = providers.find((entry) => entry.name === "custom");
    expect(provider).toBeTruthy();

    const models = provider!.config.models as Array<{
      id: string;
      name: string;
      contextWindow: number;
      maxTokens: number;
      input: string[];
    }>;
    expect(models.map((model) => model.id)).toEqual([
      "glm-5.1",
      "manual-model",
      "qwen/qwen3.5-122b-a10b",
    ]);
    expect(models[0]).toMatchObject({
      id: "glm-5.1",
      name: "GLM 5.1 via Gateway",
      contextWindow: 300_000,
      maxTokens: 100_000,
      input: ["text"],
    });
    expect(models[2]).toMatchObject({
      id: "qwen/qwen3.5-122b-a10b",
      contextWindow: 1_000_000,
      maxTokens: 65_536,
      input: ["text", "image"],
    });
  });
});
