import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { resolveGlmProfile as resolveSourceGlmProfile } from "../../src/models/resolve-glm-profile.js";
import { resolveGlmProfileV2 as resolveSourceGlmProfileV2 } from "../../src/models/resolve-glm-profile-v2.js";
import { resolveGlmProfile as resolveRuntimeGlmProfile } from "../../resources/extensions/shared/glm-profile.js";
import { resolveGlmProfileV2 as resolveRuntimeGlmProfileV2 } from "../../resources/extensions/shared/glm-profile.js";

describe("GLM runtime shared resource", () => {
  test("is generated from the source-of-truth core module", () => {
    const resourcePath = join(
      process.cwd(),
      "resources",
      "extensions",
      "shared",
      "glm-profile.js",
    );
    const contents = readFileSync(resourcePath, "utf8");

    expect(contents).toContain("GENERATED FROM src/models/glm-profile-runtime.ts");
  });

  test("matches source profile resolution behavior for representative cases", () => {
    const native = {
      modelId: "glm-5.1",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4/",
    };
    const gateway = {
      modelId: "z-ai/glm-5.1",
      baseUrl: "https://openrouter.ai/api/v1",
    };

    expect(resolveRuntimeGlmProfile(native)).toEqual(resolveSourceGlmProfile(native));
    expect(resolveRuntimeGlmProfile(gateway)).toEqual(resolveSourceGlmProfile(gateway));

    const overrideInput = {
      provider: "anthropic",
      modelId: "ZhipuAI/GLM-5-Long",
      baseUrl: "https://api-inference.modelscope.cn/v1/messages",
      overrides: [
        {
          match: {
            provider: "anthropic",
            baseUrl: "*modelscope.cn*",
            modelId: "ZhipuAI/GLM-5*",
          },
          canonicalModelId: "glm-5",
          caps: {
            contextWindow: 96_000,
          },
        },
      ],
    };

    expect(resolveRuntimeGlmProfileV2(overrideInput)).toEqual(resolveSourceGlmProfileV2(overrideInput));
  });
});
