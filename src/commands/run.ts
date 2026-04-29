import { readConfigFile } from "../app/config-store.js";
import {
  buildCapabilityEnvironment,
  buildLoopEnvironment,
  resolveLoopRuntimeOptions,
  resolveRuntimeConfig,
} from "../app/env.js";
import type { LoopFailureMode } from "../app/config-store.js";
import type { ProviderName } from "../providers/types.js";
import type { PromptMode } from "../prompt/mode-overlays.js";
import {
  runSingleTask,
  runTaskLoop,
  type SingleTaskExecutionResult,
  type LoopTaskExecutionResult,
} from "../runtime/run-runtime.js";
import { routePromptModeForTask } from "../runtime/task-router.js";
import {
  createGlmRuntime,
  withPreservedProcessCwd,
  withScopedEnvironment,
} from "../session/create-session.js";

export type RunOutputFormat = "human" | "json" | "jsonl";

export type RunCommandInput = {
  cwd: string;
  task: string;
  model?: string;
  provider?: ProviderName;
  promptMode?: PromptMode;
  yolo?: boolean;
  loop?: boolean;
  verify?: string;
  maxRounds?: number;
  maxToolCalls?: number;
  maxVerifyRuns?: number;
  failMode?: LoopFailureMode;
  json?: boolean;
  jsonl?: boolean;
};

function resolveOutputFormat(input: RunCommandInput): RunOutputFormat {
  if (input.jsonl) return "jsonl";
  if (input.json) return "json";
  return "human";
}

function emitJsonl(event: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function emitHuman(text: string, format: RunOutputFormat): void {
  if (format === "human") {
    process.stdout.write(text);
    return;
  }
  // In protocol modes keep stdout machine-readable. Send human output to stderr.
  process.stderr.write(text);
}

function emitFinalJson(result: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

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
  const loopOptions = resolveLoopRuntimeOptions(
    {
      model: input.model,
      provider: input.provider,
      yolo: input.yolo,
      loop: input.loop,
      verify: input.verify,
      maxRounds: input.maxRounds,
      maxToolCalls: input.maxToolCalls,
      maxVerifyRuns: input.maxVerifyRuns,
      failMode: input.failMode,
    },
    process.env,
    fileConfig,
  );

  const outputFormat = resolveOutputFormat(input);

  return withPreservedProcessCwd(async () =>
    withScopedEnvironment(
      {
        ...buildCapabilityEnvironment(process.env, fileConfig),
        ...buildLoopEnvironment(loopOptions),
        GLM_APPROVAL_POLICY: runtimeConfig.approvalPolicy,
        // Default to skipping Pi's npm version check for the embedded SDK. Users can opt back in
        // by setting PI_SKIP_VERSION_CHECK to an empty string before launching glm.
        PI_SKIP_VERSION_CHECK: process.env.PI_SKIP_VERSION_CHECK ?? "1",
        // Protocol output is intended for orchestration systems. Make it deterministic even
        // when a pseudo-TTY is allocated.
        ...(outputFormat === "human" ? {} : { GLM_NON_INTERACTIVE: "1" }),
      },
      async () => {
        const configuredLane = fileConfig.taskLaneDefault ?? "auto";
        const promptMode = input.promptMode ??
          (configuredLane === "auto"
            ? routePromptModeForTask({
                task: input.task,
                loopEnabled: loopOptions.enabled,
              }).mode
            : (configuredLane as PromptMode));

        const hooks = {
          emit: outputFormat === "jsonl" ? emitJsonl : undefined,
          writeHuman:
            outputFormat === "human"
              ? (text: string) => emitHuman(text, "human")
              : outputFormat === "jsonl"
                ? (text: string) => emitHuman(text, "jsonl")
                : (_text: string) => {},
        };
        const runtime = await createGlmRuntime({
          cwd: input.cwd,
          ...runtimeConfig,
          promptMode,
        });

        const startedAt = new Date().toISOString();
        hooks.emit?.({
          type: "run.start",
          at: startedAt,
          cwd: input.cwd,
          task: input.task,
          provider: runtimeConfig.provider,
          model: runtimeConfig.model,
          loop: loopOptions.enabled,
          promptMode,
        });

        const result: SingleTaskExecutionResult | LoopTaskExecutionResult = loopOptions.enabled
          ? await runTaskLoop(runtime, input.task, loopOptions, promptMode, hooks)
          : await runSingleTask(runtime, input.task, promptMode, hooks);

        hooks.emit?.({
          type: "run.done",
          at: new Date().toISOString(),
          exitCode: result.exitCode,
          kind: result.kind,
          ...(result.kind === "loop" ? { status: result.status } : {}),
        });

        if (outputFormat === "json") {
          emitFinalJson({
            kind: "glm.run_result",
            version: 1,
            createdAt: new Date().toISOString(),
            startedAt,
            cwd: input.cwd,
            task: input.task,
            provider: runtimeConfig.provider,
            model: runtimeConfig.model,
            promptMode,
            loop: loopOptions,
            result,
          });
        }

        return result.exitCode;
      },
    ),
  );
}
