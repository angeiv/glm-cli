import type { AgentSessionRuntime } from "@mariozechner/pi-coding-agent";
import type { LoopRuntimeOptions } from "../app/env.js";
import { runLoopController } from "../loop/controller.js";
import { createLoopProfile } from "../loop/profiles/index.js";
import { detectCodeVerifier } from "../loop/verify-detect.js";
import { runVerificationCommand } from "../loop/verify-runner.js";
import type { VerificationCommandResolution, VerificationResult } from "../loop/types.js";
import { composeTaskPrompt } from "./prompt.js";
import type { PromptMode } from "../prompt/mode-overlays.js";
import { patchRuntimeLoopStatus } from "../diagnostics/runtime-status.js";

export type RunRuntimeHooks = {
  /** Emit machine-readable progress events (e.g. JSONL lines). */
  emit?: (event: Record<string, unknown>) => void;
  /** Write human-facing output (stdout in human mode; stderr or capture in protocol modes). */
  writeHuman?: (text: string) => void;
};

export type SingleTaskExecutionResult = {
  kind: "single";
  exitCode: number;
  assistantText: string;
  stopReason?: string;
  errorMessage?: string;
};

export type LoopTaskExecutionResult = {
  kind: "loop";
  exitCode: number;
  status: "succeeded" | "handoff" | "failed";
  summary: string;
  rounds: Array<{ round: number; verification: VerificationResult }>;
  errorMessage?: string;
};

function defaultWriteHuman(text: string): void {
  process.stdout.write(text);
}

export async function runSingleTask(
  runtime: AgentSessionRuntime,
  task: string,
  promptMode: PromptMode = "standard",
  hooks?: RunRuntimeHooks,
): Promise<SingleTaskExecutionResult> {
  return runPromptSequence(runtime, [composeTaskPrompt(task, promptMode)], hooks);
}

type AgentAssistantMessage = {
  role?: string;
  stopReason?: string;
  errorMessage?: string;
  content?: Array<{ type?: string; text?: string }>;
};

async function bindRuntimeSession(runtime: AgentSessionRuntime): Promise<void> {
  const session = runtime.session;
  await session.bindExtensions({
    commandContextActions: {
      waitForIdle: () => session.agent.waitForIdle(),
      newSession: async (newSessionOptions) => runtime.newSession(newSessionOptions),
      fork: async (entryId) => {
        const result = await runtime.fork(entryId);
        return { cancelled: result.cancelled };
      },
      navigateTree: async (targetId, navigateOptions) => {
        const result = await session.navigateTree(targetId, {
          summarize: navigateOptions?.summarize,
          customInstructions: navigateOptions?.customInstructions,
          replaceInstructions: navigateOptions?.replaceInstructions,
          label: navigateOptions?.label,
        });
        return { cancelled: result.cancelled };
      },
      switchSession: async (sessionPath) => runtime.switchSession(sessionPath),
      reload: async () => {
        await session.reload();
      },
    },
    onError: (err) => {
      console.error(`Extension error (${err.extensionPath}): ${err.error}`);
    },
  });
}

function getLatestAssistantMessage(
  runtime: AgentSessionRuntime,
  fromMessageIndex: number,
): AgentAssistantMessage | undefined {
  const nextMessages = runtime.session.state.messages.slice(fromMessageIndex) as AgentAssistantMessage[];
  const assistantMessages = nextMessages.filter((message) => message.role === "assistant");
  if (assistantMessages.length > 0) {
    return assistantMessages[assistantMessages.length - 1];
  }

  const lastMessage = runtime.session.state.messages[
    runtime.session.state.messages.length - 1
  ] as AgentAssistantMessage | undefined;
  return lastMessage?.role === "assistant" ? lastMessage : undefined;
}

async function promptOnce(
  runtime: AgentSessionRuntime,
  message: string,
  hooks?: RunRuntimeHooks,
): Promise<{
  exitCode: number;
  assistantText: string;
  stopReason?: string;
  errorMessage?: string;
}> {
  const beforeCount = runtime.session.state.messages.length;
  await runtime.session.prompt(message, { images: [] });

  const assistantMessage = getLatestAssistantMessage(runtime, beforeCount);
  if (!assistantMessage) {
    return { exitCode: 0, assistantText: "" };
  }

  if (
    assistantMessage.stopReason === "error" ||
    assistantMessage.stopReason === "aborted"
  ) {
    const errorMessage =
      assistantMessage.errorMessage || `Request ${assistantMessage.stopReason}`;
    (hooks?.writeHuman ?? defaultWriteHuman)(`${errorMessage}\n`);
    return {
      exitCode: 1,
      assistantText: "",
      stopReason: assistantMessage.stopReason,
      errorMessage,
    };
  }

  let assistantText = "";
  for (const content of assistantMessage.content ?? []) {
    if (content.type === "text" && content.text) {
      assistantText += `${content.text}\n`;
      (hooks?.writeHuman ?? defaultWriteHuman)(`${content.text}\n`);
    }
  }

  return { exitCode: 0, assistantText, stopReason: assistantMessage.stopReason };
}

async function runPromptSequence(
  runtime: AgentSessionRuntime,
  messages: string[],
  hooks?: RunRuntimeHooks,
): Promise<SingleTaskExecutionResult> {
  try {
    await bindRuntimeSession(runtime);

    let assistantText = "";
    for (const message of messages) {
      hooks?.emit?.({ type: "turn.start", at: new Date().toISOString() });
      const result = await promptOnce(runtime, message, hooks);
      hooks?.emit?.({
        type: "turn.done",
        at: new Date().toISOString(),
        exitCode: result.exitCode,
        ...(result.stopReason ? { stopReason: result.stopReason } : {}),
      });

      assistantText += result.assistantText;

      if (result.exitCode !== 0) {
        return {
          kind: "single",
          exitCode: result.exitCode,
          assistantText,
          ...(result.stopReason ? { stopReason: result.stopReason } : {}),
          ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
        };
      }
    }

    return { kind: "single", exitCode: 0, assistantText };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    (hooks?.writeHuman ?? defaultWriteHuman)(`${message}\n`);
    return {
      kind: "single",
      exitCode: 1,
      assistantText: "",
      stopReason: "error",
      errorMessage: message,
    };
  } finally {
    await runtime.dispose();
  }
}

async function resolveVerifier(
  cwd: string,
  options: LoopRuntimeOptions,
): Promise<VerificationCommandResolution> {
  if (options.verifyCommand?.trim()) {
    return {
      kind: "command",
      command: options.verifyCommand.trim(),
      source: "explicit",
    };
  }

  const fallback = options.verifyFallbackCommand?.trim();

  if (!options.autoVerify) {
    if (fallback) {
      return {
        kind: "command",
        command: fallback,
        source: "fallback",
      };
    }
    return {
      kind: "unavailable",
      summary:
        "Loop auto verification is disabled and no verification command was provided.",
    };
  }

  const detected =
    options.profile === "code"
      ? await detectCodeVerifier(cwd)
      : {
          kind: "unavailable" as const,
          summary: `No verifier resolver is registered for profile ${options.profile}.`,
        };

  if (detected.kind === "command") {
    return detected;
  }

  if (fallback) {
    return {
      kind: "command",
      command: fallback,
      source: "fallback",
    };
  }

  return detected;
}

function toVerificationResult(
  resolution: VerificationCommandResolution,
): VerificationResult {
  if (resolution.kind === "command") {
    return {
      kind: "unavailable",
      command: resolution.command,
      summary: "Verification command was resolved but not executed.",
    };
  }

  return {
    kind: resolution.kind,
    summary: resolution.summary,
  };
}

export async function runTaskLoop(
  runtime: AgentSessionRuntime,
  task: string,
  options: LoopRuntimeOptions,
  promptMode: PromptMode = "intensive",
  hooks?: RunRuntimeHooks,
): Promise<LoopTaskExecutionResult> {
  const profile = createLoopProfile(options.profile, promptMode);
  const verifier = await resolveVerifier(runtime.cwd, options);
  const maxToolCalls = options.maxToolCalls;
  const maxVerifyRuns = options.maxVerifyRuns;
  let toolCallsUsed = 0;
  let verifyRunsUsed = 0;
  let contractSent = false;

  patchRuntimeLoopStatus({
    mode: "auto",
    phase: "run",
    roundsUsed: 0,
    toolCallsUsed: 0,
    verifyRunsUsed: 0,
  });

  try {
    await bindRuntimeSession(runtime);

    hooks?.emit?.({
      type: "loop.start",
      at: new Date().toISOString(),
      task,
      maxRounds: options.maxRounds,
      ...(maxToolCalls === undefined ? {} : { maxToolCalls }),
      ...(maxVerifyRuns === undefined ? {} : { maxVerifyRuns }),
    });

    const result = await runLoopController({
      task,
      maxRounds: options.maxRounds,
      ...(maxVerifyRuns === undefined ? {} : { maxVerifyRuns }),
      failureMode: options.failureMode,
      profile,
      executeTurn: async (message, round) => {
        hooks?.emit?.({
          type: "loop.turn.start",
          at: new Date().toISOString(),
          round,
        });

        patchRuntimeLoopStatus({
          mode: "auto",
          phase: contractSent ? "repair" : "run",
          roundsUsed: round,
          toolCallsUsed,
          verifyRunsUsed,
        });
        contractSent = true;

        const beforeCount = runtime.session.state.messages.length;
        const turn = await promptOnce(runtime, message, hooks);
        if (turn.exitCode !== 0) {
          throw new Error("Loop turn failed before verification could run.");
        }

        const nextMessages = runtime.session.state.messages.slice(beforeCount) as Array<{ role?: string }>;
        // Pi stores tool executions as `toolResult` messages.
        const toolDelta = nextMessages.filter((msg) => msg.role === "toolResult").length;
        toolCallsUsed += toolDelta;
        patchRuntimeLoopStatus({ toolCallsUsed });

        hooks?.emit?.({
          type: "loop.turn.done",
          at: new Date().toISOString(),
          round,
          toolCallsUsed,
        });
      },
      runVerification: async (round) => {
        hooks?.emit?.({
          type: "loop.verify.start",
          at: new Date().toISOString(),
          round,
          toolCallsUsed,
          verifyRunsUsed,
        });

        patchRuntimeLoopStatus({
          mode: "auto",
          phase: "verify",
          roundsUsed: round,
          toolCallsUsed,
          verifyRunsUsed,
        });

        if (maxToolCalls !== undefined && toolCallsUsed > maxToolCalls) {
          const verification = {
            kind: "unavailable",
            summary: `Tool call budget exceeded (maxToolCalls=${maxToolCalls}, used=${toolCallsUsed}).`,
          } satisfies VerificationResult;
          hooks?.emit?.({
            type: "loop.verify.result",
            at: new Date().toISOString(),
            round,
            kind: verification.kind,
            summary: verification.summary,
          });
          return verification;
        }

        if (maxVerifyRuns !== undefined && verifyRunsUsed >= maxVerifyRuns) {
          const verification = {
            kind: "unavailable",
            summary: `Verification budget exceeded (maxVerifyRuns=${maxVerifyRuns}).`,
          } satisfies VerificationResult;
          hooks?.emit?.({
            type: "loop.verify.result",
            at: new Date().toISOString(),
            round,
            kind: verification.kind,
            summary: verification.summary,
          });
          return verification;
        }

        if (verifier.kind !== "command") {
          const verification = toVerificationResult(verifier);
          hooks?.emit?.({
            type: "loop.verify.result",
            at: new Date().toISOString(),
            round,
            kind: verification.kind,
            summary: verification.summary,
          });
          return verification;
        }

        verifyRunsUsed += 1;
        patchRuntimeLoopStatus({ verifyRunsUsed });
        const verification = await runVerificationCommand({
          cwd: runtime.cwd,
          command: verifier.command,
        });

        hooks?.emit?.({
          type: "loop.verify.result",
          at: new Date().toISOString(),
          round,
          kind: verification.kind,
          summary: verification.summary,
          ...(verification.exitCode === undefined ? {} : { exitCode: verification.exitCode }),
        });

        return verification;
      },
    });

    (hooks?.writeHuman ?? defaultWriteHuman)(`${result.summary}\n`);
    hooks?.emit?.({
      type: "loop.done",
      at: new Date().toISOString(),
      status: result.status,
    });

    return {
      kind: "loop",
      exitCode: result.status === "succeeded" ? 0 : 1,
      status: result.status,
      summary: result.summary,
      rounds: result.rounds,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    (hooks?.writeHuman ?? defaultWriteHuman)(`${message}\n`);
    hooks?.emit?.({ type: "loop.error", at: new Date().toISOString(), error: message });
    return {
      kind: "loop",
      exitCode: 1,
      status: "failed",
      summary: message,
      rounds: [],
      errorMessage: message,
    };
  } finally {
    await runtime.dispose();
  }
}
