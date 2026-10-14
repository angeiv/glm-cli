import { afterEach, describe, expect, test, vi } from "vitest";
import { getDefaultConfigFile } from "../../src/app/config-store.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("runRunCommand", () => {
  test("prints task route metadata in JSON output", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    vi.doMock("../../src/app/config-store.js", async () => {
      const actual = await vi.importActual<typeof import("../../src/app/config-store.js")>(
        "../../src/app/config-store.js",
      );

      return {
        ...actual,
        readConfigFile: vi.fn(async () => getDefaultConfigFile()),
      };
    });

    vi.doMock("../../src/session/create-session.js", async () => {
      const actual = await vi.importActual<typeof import("../../src/session/create-session.js")>(
        "../../src/session/create-session.js",
      );

      return {
        ...actual,
        createGlmRuntime: vi.fn(async () => ({ cwd: "/tmp/repo" })),
        withPreservedProcessCwd: vi.fn(async (fn: () => Promise<number>) => fn()),
        withScopedEnvironment: vi.fn(
          async (_env: Partial<NodeJS.ProcessEnv>, fn: () => Promise<number>) => fn(),
        ),
      };
    });

    vi.doMock("../../src/runtime/run-runtime.js", () => ({
      runSingleTask: vi.fn(async () => ({
        kind: "single",
        exitCode: 0,
        assistantText: "review complete",
      })),
      runTaskLoop: vi.fn(),
    }));

    const { runRunCommand } = await import("../../src/commands/run.js");

    const exitCode = await runRunCommand({
      cwd: "/tmp/repo",
      task: "review the current diff for regressions",
      json: true,
    });

    expect(exitCode).toBe(0);

    const payload = JSON.parse(String(stdout.mock.calls.at(-1)?.[0]));
    expect(payload.taskRoute).toMatchObject({
      promptMode: "standard",
      taskIntent: "review",
      verifierHarness: "disabled",
    });
  });
});
