import { InteractiveMode, type AgentSessionRuntime } from "@mariozechner/pi-coding-agent";

export async function runChatSession(runtime: AgentSessionRuntime): Promise<void> {
  const interactiveMode = new InteractiveMode(runtime, {
    migratedProviders: [],
    modelFallbackMessage: runtime.modelFallbackMessage,
    initialImages: [],
    initialMessages: [],
  });

  await interactiveMode.run();
}
