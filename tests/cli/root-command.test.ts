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

  test("rejects run mode without a task description", () => {
    expect(() => parseCliArgs(["run"])).toThrow("run command requires a task");
    expect(() => parseCliArgs(["run", "--yolo"])).toThrow("run command requires a task");
  });
});
