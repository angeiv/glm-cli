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

  test("enables zaiToolStream compat only for models that support tool streaming", async () => {
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

    const glmProvider = providers.find((p) => p.name === "glm");
    expect(glmProvider).toBeTruthy();

    const models = glmProvider!.config.models as Array<{ id: string; compat?: any }>;
    const glm51 = models.find((m) => m.id === "glm-5.1");
    const glm45 = models.find((m) => m.id === "glm-4.5-air");
    const glm46 = models.find((m) => m.id === "glm-4.6");

    expect(glm51?.compat?.zaiToolStream).toBe(true);
    expect(glm45?.compat?.zaiToolStream).toBe(false);
    expect(glm46?.compat?.zaiToolStream).toBe(true);
  });

  test("applies override-defined modalities to provider model registration", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_BASE_URL = "https://gateway.example.com/v1";
    process.env.OPENAI_MODEL = "vendor/some-custom-model";
    readGlmModelProfileOverridesMock.mockReturnValue([
      {
        match: {
          provider: "openai-compatible",
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

    const provider = providers.find((p) => p.name === "openai-compatible");
    expect(provider).toBeTruthy();

    const model = (provider!.config.models as Array<{ id: string; input: string[] }>).find(
      (entry) => entry.id === "vendor/some-custom-model",
    );
    expect(model?.input).toEqual(["text"]);
  });
});
