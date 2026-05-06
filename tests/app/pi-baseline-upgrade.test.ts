import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findEnvKeys, getEnvApiKey, getModel, getProviders } from "@mariozechner/pi-ai";
import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

describe("pi baseline upgrade", () => {
  test("pins repo dependencies and installed packages to pi 0.73.x", () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    const piAiPackage = JSON.parse(
      readFileSync(join(repoRoot, "node_modules/@mariozechner/pi-ai/package.json"), "utf8"),
    ) as { version: string };
    const piCodingPackage = JSON.parse(
      readFileSync(
        join(repoRoot, "node_modules/@mariozechner/pi-coding-agent/package.json"),
        "utf8",
      ),
    ) as { version: string };

    expect(packageJson.dependencies["@mariozechner/pi-ai"]).toBe("^0.73.0");
    expect(packageJson.dependencies["@mariozechner/pi-coding-agent"]).toBe("^0.73.0");
    expect(piAiPackage.version).toBe("0.73.0");
    expect(piCodingPackage.version).toBe("0.73.0");
  });

  test("retains deepseek provider primitives after the upgrade", () => {
    const previousApiKey = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";

    try {
      expect(findEnvKeys("deepseek")).toContain("DEEPSEEK_API_KEY");
      expect(getEnvApiKey("deepseek")).toBe("test-deepseek-key");
      expect(getProviders()).toContain("deepseek");

      const model = getModel("deepseek", "deepseek-v4-pro");

      expect(model.provider).toBe("deepseek");
      expect(model.baseUrl).toContain("deepseek.com");
      expect(model.compat?.thinkingFormat).toBe("deepseek");
      expect(model.compat?.requiresReasoningContentOnAssistantMessages).toBe(true);
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.DEEPSEEK_API_KEY;
      } else {
        process.env.DEEPSEEK_API_KEY = previousApiKey;
      }
    }
  });
});
