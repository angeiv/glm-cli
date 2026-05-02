import { beforeEach, describe, expect, test, vi } from "vitest";

const readGlmUserConfigMock = vi.fn(() => ({}));
const readGlmModelProfileOverridesMock = vi.fn(() => []);

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

describe("glm-providers extension", () => {
  beforeEach(() => {
    readGlmUserConfigMock.mockReturnValue({});
    readGlmModelProfileOverridesMock.mockReturnValue([]);
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
    registerProvidersExtension(pi as any);

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
    registerProvidersExtension(pi as any);

    const provider = providers.find((p) => p.name === "custom");
    expect(provider).toBeTruthy();

    const model = (provider!.config.models as Array<{ id: string; input: string[] }>).find(
      (entry) => entry.id === "vendor/some-custom-model",
    );
    expect(model?.input).toEqual(["text"]);
  });
});
