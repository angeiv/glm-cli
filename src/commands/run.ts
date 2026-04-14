import { readConfigFile } from "../app/config-store.js";
import { resolveRuntimeConfig } from "../app/env.js";
import type { ProviderName } from "../providers/types.js";
import { runSingleTask } from "../runtime/run-runtime.js";
import {
  createGlmRuntime,
  withPreservedProcessCwd,
  withScopedEnvironment,
} from "../session/create-session.js";

export type RunCommandInput = {
  cwd: string;
  task: string;
  model?: string;
  provider?: ProviderName;
  yolo?: boolean;
};

export async function runRunCommand(input: RunCommandInput): Promise<number> {
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

  return withPreservedProcessCwd(async () =>
    withScopedEnvironment(
      {
        GLM_APPROVAL_POLICY: runtimeConfig.approvalPolicy,
        // Default to skipping Pi's npm version check for the embedded SDK. Users can opt back in
        // by setting PI_SKIP_VERSION_CHECK to an empty string before launching glm.
        PI_SKIP_VERSION_CHECK: process.env.PI_SKIP_VERSION_CHECK ?? "1",
      },
      async () => {
        const runtime = await createGlmRuntime({
          cwd: input.cwd,
          ...runtimeConfig,
        });

        return runSingleTask(runtime, input.task);
      },
    ),
  );
}
