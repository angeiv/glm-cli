import { describe, expect, test } from "vitest";
import { parseCliArgs } from "../../src/cli.js";

describe("parseCliArgs", () => {
  test("defaults to chat mode when no subcommand is present", () => {
    expect(parseCliArgs([])).toMatchObject({
      command: "chat",
      yolo: false,
      cwd: process.cwd(),
    });
  });

  test("parses run mode and yolo flag", () => {
    expect(parseCliArgs(["run", "fix tests", "--yolo"])).toMatchObject({
      command: "run",
      task: "fix tests",
      yolo: true,
    });
  });
});
