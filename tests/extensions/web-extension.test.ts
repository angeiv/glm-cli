import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { describe, expect, test } from "vitest";
import registerGlmWeb from "../../resources/extensions/glm-web/index.js";

describe("glm-web extension", () => {
  test("registers web_search and web_fetch tools", () => {
    const tools: string[] = [];
    registerGlmWeb({
      registerTool: (tool: { name: string }) => {
        tools.push(tool.name);
      },
    } as unknown as ExtensionAPI);

    expect(tools).toContain("web_search");
    expect(tools).toContain("web_fetch");
  });
});

