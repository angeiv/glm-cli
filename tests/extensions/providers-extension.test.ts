import { beforeEach, describe, expect, test, vi } from "vitest";

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
  process.env = { ...ORIGINAL_ENV };
});

vi.mock("../../resources/extensions/shared/glm-user-config.js", () => {
  return {
    readGlmUserConfig: () => ({}),
    readGlmModelProfileOverrides: () => [],
  };
});

describe("glm-providers extension", () => {
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
      "../../resources/extensions/glm-providers/index.js"
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
});
