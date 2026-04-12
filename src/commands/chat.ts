import { readConfigFile } from "../app/config-store.js";
import { resolveRuntimeConfig } from "../app/env.js";
import type { ProviderName } from "../providers/types.js";
import { runChatSession } from "../runtime/chat-runtime.js";
import { createGlmRuntime } from "../session/create-session.js";

export type ChatCommandInput = {
  cwd: string;
  model?: string;
  provider?: ProviderName;
  yolo?: boolean;
};

export async function runChatCommand(input: ChatCommandInput): Promise<void> {
  const fileConfig = await readConfigFile();
  const runtimeConfig = resolveRuntimeConfig(
    {
      model: input.model,
      provider: input.provider,
      yolo: input.yolo,
    },
    process.env,
    fileConfig,
  );
  const runtime = await createGlmRuntime({
    cwd: input.cwd,
    ...runtimeConfig,
  });

  await runChatSession(runtime);
}
