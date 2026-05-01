import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, test, vi } from "vitest";
import registerGlmWeb from "../../resources/extensions/glm-web/index.js";

describe("glm-web extension", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  test("web_fetch strips html without leaking attribute fragments", async () => {
    const tools = new Map<
      string,
      {
        execute: (
          toolCallId: string,
          params: { url: string },
          signal?: AbortSignal,
        ) => Promise<any>;
      }
    >();

    registerGlmWeb({
      registerTool: (tool: {
        name: string;
        execute: (
          toolCallId: string,
          params: { url: string },
          signal?: AbortSignal,
        ) => Promise<any>;
      }) => {
        tools.set(tool.name, tool);
      },
    } as unknown as ExtensionAPI);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          '<div data-title="1 > 0">Hello <strong>world</strong></div><script>alert(1)</script><p>done</p>',
          {
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
          },
        ),
      ),
    );

    const webFetch = tools.get("web_fetch");
    expect(webFetch).toBeDefined();

    const result = await webFetch?.execute("tool-1", { url: "https://example.com" });
    const text = result?.content[0]?.text;

    expect(text).toBe("Hello world done");
    expect(text).not.toContain('0">');
    expect(text).not.toContain("alert(1)");
  });
});
