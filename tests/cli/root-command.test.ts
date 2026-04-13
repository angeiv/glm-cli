import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CliHandlers, parseCliArgs, runCli } from "../../src/cli.js";

describe("parseCliArgs", () => {
  test("defaults to chat with process cwd when no subcommand provided", () => {
    expect(parseCliArgs([])).toMatchObject({
      command: "chat",
      cwd: process.cwd(),
      yolo: false,
    });
  });

  test("parses run command with task and global flags", () => {
    expect(parseCliArgs(["run", "fix tests", "--provider", "openai-compatible", "--yolo"])).toMatchObject({
      command: "run",
      task: "fix tests",
      provider: "openai-compatible",
      yolo: true,
    });
  });

  test("parses doctor command and respects cwd override", () => {
    expect(parseCliArgs(["doctor", "--cwd", "/tmp", "--model", "glm-5"])).toMatchObject({
      command: "doctor",
      cwd: "/tmp",
      model: "glm-5",
    });
  });

  test("parses auth login command", () => {
    expect(parseCliArgs(["auth", "login"])).toMatchObject({
      command: "auth",
      subcommand: "login",
    });
  });
});

describe("runCli", () => {
  let handlers: CliHandlers;

  beforeEach(() => {
    handlers = {
      chat: vi.fn(async () => 0) as CliHandlers["chat"],
      run: vi.fn(async () => 0) as CliHandlers["run"],
      doctor: vi.fn(async () => 0) as CliHandlers["doctor"],
      authLogin: vi.fn(async () => 0),
    };
  });

  test("dispatches to chat handler by default and returns its exit code", async () => {
    (handlers.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(42);
    const exitCode = await runCli([], handlers);
    expect(exitCode).toBe(42);
    expect(handlers.chat).toHaveBeenCalledOnce();
  });

  test("dispatches to run handler with task context", async () => {
    await runCli(["run", "docs"], handlers);
    expect(handlers.run).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "docs",
        yolo: false,
      }),
    );
  });

  test("dispatches to doctor with parsed flags", async () => {
    await runCli(["doctor", "--yolo", "--provider", "glm-official"], handlers);
    expect(handlers.doctor).toHaveBeenCalledWith(
      expect.objectContaining({
        cli: expect.objectContaining({ yolo: true, provider: "glm-official" }),
      }),
    );
  });

  test("dispatches to auth login", async () => {
    await runCli(["auth", "login"], handlers);
    expect(handlers.authLogin).toHaveBeenCalledOnce();
  });
});

test("loader keeps a node shebang for direct glm execution", () => {
  const source = readFileSync(new URL("../../src/loader.ts", import.meta.url), "utf8");
  expect(source.startsWith("#!/usr/bin/env node")).toBe(true);
});
