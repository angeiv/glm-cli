import { describe, expect, test } from "vitest";
import { resolveProviderSelection } from "../../src/providers/index.js";

describe("resolveProviderSelection", () => {
  test("maps ANTHROPIC_* env to anthropic compatibility mode", () => {
    const resolved = resolveProviderSelection(
      {},
      {
        ANTHROPIC_AUTH_TOKEN: "token",
        ANTHROPIC_BASE_URL: "https://open.bigmodel.cn/api/anthropic",
        ANTHROPIC_MODEL: "glm-5",
      },
    );

    expect(resolved.provider).toBe("anthropic");
    expect(resolved.model).toBe("glm-5");
  });
});
