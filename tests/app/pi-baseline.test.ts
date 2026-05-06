import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findEnvKeys, getEnvApiKey, getModels, getProviders } from "@mariozechner/pi-ai";
import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function extractPinnedVersion(specifier: string): string {
  const match = specifier.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/);
  if (!match) {
    throw new Error(`Unable to extract pinned version from specifier: ${specifier}`);
  }
  return match[0];
}

describe("pi baseline compatibility", () => {
  test("keeps installed pi packages aligned with the declared dependency baseline", () => {
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

    expect(piAiPackage.version).toBe(
      extractPinnedVersion(packageJson.dependencies["@mariozechner/pi-ai"]),
    );
    expect(piCodingPackage.version).toBe(
      extractPinnedVersion(packageJson.dependencies["@mariozechner/pi-coding-agent"]),
    );
  });

  test("retains deepseek provider primitives in the pi baseline", () => {
    const previousApiKey = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";

    try {
      expect(findEnvKeys("deepseek")).toContain("DEEPSEEK_API_KEY");
      expect(getEnvApiKey("deepseek")).toBe("test-deepseek-key");
      expect(getProviders()).toContain("deepseek");

      const models = getModels("deepseek");
      expect(models.length).toBeGreaterThan(0);

      const reasoningModel = models.find(
        (model) =>
          model.compat?.thinkingFormat === "deepseek" &&
          model.compat?.requiresReasoningContentOnAssistantMessages === true,
      );

      expect(reasoningModel).toBeDefined();
      expect(reasoningModel?.provider).toBe("deepseek");
      expect(reasoningModel?.baseUrl).toContain("deepseek.com");
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.DEEPSEEK_API_KEY;
      } else {
        process.env.DEEPSEEK_API_KEY = previousApiKey;
      }
    }
  });
});
