import { afterEach, describe, expect, test, vi } from "vitest";
import {
  installInteractiveSessionRebindRecovery,
  type RebindableRuntimeHost,
} from "../../src/runtime/chat-runtime.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("chat runtime", () => {
  test("refreshes interactive input bindings after session replacement", async () => {
    let rebindSession: (() => Promise<void>) | undefined;
    const runtime = {
      setRebindSession: vi.fn((handler: () => Promise<void>) => {
        rebindSession = handler;
      }),
    } as unknown as RebindableRuntimeHost;
    const interactiveMode = {
      rebindCurrentSession: vi.fn(async () => undefined),
      setupEditorSubmitHandler: vi.fn(),
      editor: {},
      ui: {
        setFocus: vi.fn(),
        requestRender: vi.fn(),
      },
    };

    installInteractiveSessionRebindRecovery(runtime, interactiveMode);
    await rebindSession?.();

    expect(interactiveMode.rebindCurrentSession).toHaveBeenCalledTimes(1);
    expect(interactiveMode.setupEditorSubmitHandler).toHaveBeenCalledTimes(1);
    expect(interactiveMode.ui.setFocus).toHaveBeenCalledWith(interactiveMode.editor);
    expect(interactiveMode.ui.requestRender).toHaveBeenCalledTimes(1);
  });

  test("runChatSession installs resume input recovery before starting interactive mode", async () => {
    let rebindSession: (() => Promise<void>) | undefined;
    const interactiveMode = {
      rebindCurrentSession: vi.fn(async () => undefined),
      setupEditorSubmitHandler: vi.fn(),
      editor: {},
      ui: {
        setFocus: vi.fn(),
        requestRender: vi.fn(),
      },
      run: vi.fn(async () => undefined),
    };
    const InteractiveMode = vi.fn(function MockInteractiveMode() {
      return interactiveMode;
    });

    vi.doMock("@mariozechner/pi-coding-agent", async () => {
      const actual = await vi.importActual<typeof import("@mariozechner/pi-coding-agent")>(
        "@mariozechner/pi-coding-agent",
      );

      return {
        ...actual,
        InteractiveMode,
      };
    });

    const { runChatSession } = await import("../../src/runtime/chat-runtime.js");
    const runtime = {
      modelFallbackMessage: undefined,
      setRebindSession: vi.fn((handler: () => Promise<void>) => {
        rebindSession = handler;
      }),
    } as unknown as RebindableRuntimeHost;

    await runChatSession(runtime);
    await rebindSession?.();

    expect(InteractiveMode).toHaveBeenCalledWith(
      runtime,
      expect.objectContaining({
        migratedProviders: [],
        initialImages: [],
        initialMessages: [],
      }),
    );
    expect(interactiveMode.run).toHaveBeenCalledTimes(1);
    expect(interactiveMode.rebindCurrentSession).toHaveBeenCalledTimes(1);
    expect(interactiveMode.setupEditorSubmitHandler).toHaveBeenCalledTimes(1);
  });
});
