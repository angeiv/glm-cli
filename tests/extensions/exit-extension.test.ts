import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";

const extensionSourcePath = resolve(
  process.cwd(),
  "resources/extensions/glm-exit/index.ts",
);

describe("glm-exit extension", () => {
  test("registers /exit and shuts down the session", async () => {
    if (!existsSync(extensionSourcePath)) {
      expect.fail("glm-exit extension is missing");
    }

    const { default: registerGlmExit } = await import(
      "../../resources/extensions/glm-exit/index.js"
    );

    let handler:
      | ((args: string, ctx: { shutdown: () => void }) => void | Promise<void>)
      | undefined;

    registerGlmExit({
      registerCommand: (
        name: string,
        options: {
          handler: (args: string, ctx: { shutdown: () => void }) => void | Promise<void>;
        },
      ) => {
        if (name === "exit") {
          handler = options.handler;
        }
      },
    } as unknown as ExtensionAPI);

    expect(handler).toBeTypeOf("function");

    const shutdown = vi.fn();
    await handler?.("", { shutdown });
    expect(shutdown).toHaveBeenCalledTimes(1);
  });
});
