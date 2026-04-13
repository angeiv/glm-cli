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

  test("parses chat positional path as cwd", () => {
    expect(parseCliArgs(["chat", "/tmp/project"])).toMatchObject({
      command: "chat",
      cwd: "/tmp/project",
      yolo: false,
    });
  });

  test("parses run positional path as cwd", () => {
    expect(parseCliArgs(["run", "fix tests", "/tmp/project"])).toMatchObject({
      command: "run",
      task: "fix tests",
      cwd: "/tmp/project",
      yolo: false,
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

  test("parses auth status command", () => {
    expect(parseCliArgs(["auth", "status"])).toMatchObject({
      command: "auth",
      subcommand: "status",
    });
  });

  test("parses auth logout command", () => {
    expect(parseCliArgs(["auth", "logout"])).toMatchObject({
      command: "auth",
      subcommand: "logout",
    });
  });

  test("parses config get command", () => {
    expect(parseCliArgs(["config", "get", "defaultModel"])).toMatchObject({
      command: "config",
      subcommand: "get",
      key: "defaultModel",
    });
  });

  test("parses config set command", () => {
    expect(parseCliArgs(["config", "set", "defaultModel", "glm-5-air"])).toMatchObject({
      command: "config",
      subcommand: "set",
      key: "defaultModel",
      value: "glm-5-air",
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
      authStatus: vi.fn(async () => 0),
      authLogout: vi.fn(async () => 0),
      configGet: vi.fn(async () => 0),
      configSet: vi.fn(async () => 0),
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

  test("dispatches to auth status", async () => {
    await runCli(["auth", "status"], handlers);
    expect(handlers.authStatus).toHaveBeenCalledOnce();
  });

  test("dispatches to auth logout", async () => {
    await runCli(["auth", "logout"], handlers);
    expect(handlers.authLogout).toHaveBeenCalledOnce();
  });

  test("dispatches to config get", async () => {
    await runCli(["config", "get", "defaultModel"], handlers);
    expect(handlers.configGet).toHaveBeenCalledWith("defaultModel");
  });

  test("dispatches to config set", async () => {
    await runCli(["config", "set", "defaultModel", "glm-5-air"], handlers);
    expect(handlers.configSet).toHaveBeenCalledWith("defaultModel", "glm-5-air");
  });

  test("passes positional run path as cwd", async () => {
    await runCli(["run", "docs", "/tmp/project"], handlers);
    expect(handlers.run).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "docs",
        cwd: "/tmp/project",
      }),
    );
  });
});

test("loader keeps a node shebang for direct glm execution", () => {
  const source = readFileSync(new URL("../../src/loader.ts", import.meta.url), "utf8");
  expect(source.startsWith("#!/usr/bin/env node")).toBe(true);
});
