import { InteractiveMode, type AgentSessionRuntime } from "@mariozechner/pi-coding-agent";

export type RebindableRuntimeHost = AgentSessionRuntime & {
  setRebindSession(handler?: (session: unknown) => Promise<void>): void;
};

type InteractiveSessionRebindTarget = {
  rebindCurrentSession?: () => Promise<void>;
  setupEditorSubmitHandler?: () => void;
  editor?: unknown;
  ui?: {
    setFocus?: (component: unknown) => void;
    requestRender?: () => void;
  };
};

export function installInteractiveSessionRebindRecovery(
  runtime: RebindableRuntimeHost,
  interactiveMode: InteractiveSessionRebindTarget,
): void {
  runtime.setRebindSession(async () => {
    await interactiveMode.rebindCurrentSession?.();
    interactiveMode.setupEditorSubmitHandler?.();

    if (interactiveMode.editor) {
      interactiveMode.ui?.setFocus?.(interactiveMode.editor);
    }
    interactiveMode.ui?.requestRender?.();
  });
}

export async function runChatSession(runtime: AgentSessionRuntime): Promise<void> {
  const interactiveMode = new InteractiveMode(runtime, {
    migratedProviders: [],
    modelFallbackMessage: runtime.modelFallbackMessage,
    initialImages: [],
    initialMessages: [],
  });

  installInteractiveSessionRebindRecovery(
    runtime as RebindableRuntimeHost,
    interactiveMode as unknown as InteractiveSessionRebindTarget,
  );

  await interactiveMode.run();
}
