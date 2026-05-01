import { readConfigFile, type GlmConfigFile } from "../app/config-store.js";
import {
  resolveNotificationRuntimeOptions,
  resolveDiagnosticsRuntimeOptions,
  resolveLoopRuntimeOptions,
  resolveRuntimeConfig,
  type RuntimeCliFlags,
} from "../app/env.js";
import { buildRuntimeStatus, formatRuntimeStatusLines } from "../diagnostics/runtime-status.js";
import type { RuntimeStatus } from "../diagnostics/types.js";
import { resolveGlmSessionPaths } from "../session/session-paths.js";

export type InspectCommandArgs = {
  cwd: string;
  cli: RuntimeCliFlags;
  env?: NodeJS.ProcessEnv;
  json?: boolean;
};

type InspectDependencies = {
  readConfigFile: () => Promise<GlmConfigFile>;
  log: (message: string) => void;
};

export async function inspectRuntime(
  input: Omit<InspectCommandArgs, "json">,
  deps?: Partial<InspectDependencies>,
): Promise<RuntimeStatus> {
  const env = input.env ?? process.env;
  const config = await (deps?.readConfigFile ?? readConfigFile)();
  const runtime = resolveRuntimeConfig(input.cli, env, config);
  const loop = resolveLoopRuntimeOptions(input.cli, env, config);
  const diagnostics = resolveDiagnosticsRuntimeOptions(config);
  const notifications = resolveNotificationRuntimeOptions(env, config);

  return buildRuntimeStatus({
    cwd: input.cwd,
    runtime,
    loop,
    diagnostics,
    notifications,
    paths: resolveGlmSessionPaths(input.cwd),
    env,
    config,
  });
}

export async function runInspectCommand(
  input: InspectCommandArgs,
  deps?: Partial<InspectDependencies>,
): Promise<number> {
  const status = await inspectRuntime(input, deps);
  const log = deps?.log ?? console.log;

  if (input.json) {
    log(JSON.stringify(status, null, 2));
    return 0;
  }

  log(formatRuntimeStatusLines(status).join("\n"));
  return 0;
}
