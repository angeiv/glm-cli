import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { describe, expect, test } from "vitest";
import registerGlmStats from "../../resources/extensions/glm-stats/index.js";

describe("glm-stats extension", () => {
  test("registers /stats and /usage commands", () => {
    const commands: string[] = [];

    registerGlmStats({
      registerCommand: (name: string) => {
        commands.push(name);
      },
    } as unknown as ExtensionAPI);

    expect(commands).toContain("stats");
    expect(commands).toContain("usage");
  });
});
