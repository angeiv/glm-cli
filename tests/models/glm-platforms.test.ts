import { describe, expect, test } from "vitest";
import { resolveGlmPlatformRoute } from "../../src/models/glm-platforms.js";

describe("GLM platform routing", () => {
  test("detects native GLM routes and common gateways", () => {
    expect(resolveGlmPlatformRoute("https://open.bigmodel.cn/api/paas/v4/")).toBe(
      "native-bigmodel",
    );
    expect(resolveGlmPlatformRoute("https://api.z.ai/api/paas/v4/")).toBe("native-zai");
    expect(resolveGlmPlatformRoute("https://openrouter.ai/api/v1")).toBe("gateway-openrouter");
    expect(resolveGlmPlatformRoute("https://gateway.example.com/v1")).toBe("gateway-other");
  });

  test("prefers explicit upstream provider hints over proxy urls", () => {
    expect(resolveGlmPlatformRoute("https://aihub.internal.example/v1", "openrouter")).toBe(
      "gateway-openrouter",
    );
    expect(resolveGlmPlatformRoute("https://aihub.internal.example/v1", "bigmodel")).toBe(
      "native-bigmodel",
    );
  });
});
