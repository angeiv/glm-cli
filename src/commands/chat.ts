import { readConfigFile } from "../app/config-store.js";
import {
  buildCapabilityEnvironment,
  buildLoopEnvironment,
  resolveLoopRuntimeOptions,
  resolveRuntimeConfig,
} from "../app/env.js";
import type { LoopFailureMode } from "../app/config-store.js";
import type { ProviderName } from "../providers/types.js";
import { runChatSession } from "../runtime/chat-runtime.js";
import {
  createGlmRuntime,
  withPreservedProcessCwd,
  withScopedEnvironment,
} from "../session/create-session.js";

export type ChatCommandInput = {
  cwd: string;
  model?: string;
  provider?: ProviderName;
  yolo?: boolean;
  loop?: boolean;
  verify?: string;
  maxRounds?: number;
  failMode?: LoopFailureMode;
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
  const loopOptions = resolveLoopRuntimeOptions(
    {
      model: input.model,
      provider: input.provider,
      yolo: input.yolo,
      loop: input.loop,
      verify: input.verify,
      maxRounds: input.maxRounds,
      failMode: input.failMode,
    },
    process.env,
    fileConfig,
  );

  await withPreservedProcessCwd(async () =>
    withScopedEnvironment(
      {
        ...buildCapabilityEnvironment(process.env, fileConfig),
        ...buildLoopEnvironment(loopOptions),
        GLM_APPROVAL_POLICY: runtimeConfig.approvalPolicy,
        // Default to skipping Pi's npm version check for the embedded SDK. Users can opt back in
        // by setting PI_SKIP_VERSION_CHECK to an empty string before launching glm.
        PI_SKIP_VERSION_CHECK: process.env.PI_SKIP_VERSION_CHECK ?? "1",
      },
      async () => {
        const runtime = await createGlmRuntime({
          cwd: input.cwd,
          ...runtimeConfig,
          promptMode: "standard",
        });

        await runChatSession(runtime);
      },
    ),
  );
}
