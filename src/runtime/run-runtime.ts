import type { AgentSessionRuntime } from "@mariozechner/pi-coding-agent";
import type { LoopRuntimeOptions } from "../app/env.js";
import { runLoopController } from "../loop/controller.js";
import { createLoopProfile } from "../loop/profiles/index.js";
import { detectCodeVerifier } from "../loop/verify-detect.js";
import { runVerificationCommand } from "../loop/verify-runner.js";
import type { VerificationCommandResolution, VerificationResult } from "../loop/types.js";
import { composeTaskPrompt } from "./prompt.js";

function writeStdout(text: string): void {
  process.stdout.write(text);
}

export async function runSingleTask(
  runtime: AgentSessionRuntime,
  task: string,
): Promise<number> {
  return runPromptSequence(runtime, [composeTaskPrompt(task, "standard")]);
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
): Promise<number> {
  const beforeCount = runtime.session.state.messages.length;
  await runtime.session.prompt(message, { images: [] });

  const assistantMessage = getLatestAssistantMessage(runtime, beforeCount);
  if (!assistantMessage) {
    return 0;
  }

  if (
    assistantMessage.stopReason === "error" ||
    assistantMessage.stopReason === "aborted"
  ) {
    console.error(
      assistantMessage.errorMessage || `Request ${assistantMessage.stopReason}`,
    );
    return 1;
  }

  for (const content of assistantMessage.content ?? []) {
    if (content.type === "text" && content.text) {
      writeStdout(`${content.text}\n`);
    }
  }

  return 0;
}

async function runPromptSequence(
  runtime: AgentSessionRuntime,
  messages: string[],
): Promise<number> {
  try {
    await bindRuntimeSession(runtime);

    for (const message of messages) {
      const exitCode = await promptOnce(runtime, message);
      if (exitCode !== 0) {
        return exitCode;
      }
    }

    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
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
      source: "config",
    };
  }

  if (!options.autoVerify) {
    return {
      kind: "unavailable",
      summary:
        "Loop auto verification is disabled and no verification command was provided.",
    };
  }

  if (options.profile === "code") {
    return detectCodeVerifier(cwd);
  }

  return {
    kind: "unavailable",
    summary: `No verifier resolver is registered for profile ${options.profile}.`,
  };
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
): Promise<number> {
  const profile = createLoopProfile(options.profile);
  const verifier = await resolveVerifier(runtime.cwd, options);

  try {
    await bindRuntimeSession(runtime);

    const result = await runLoopController({
      task,
      maxRounds: options.maxRounds,
      failureMode: options.failureMode,
      profile,
      executeTurn: async (message) => {
        const exitCode = await promptOnce(runtime, message);
        if (exitCode !== 0) {
          throw new Error("Loop turn failed before verification could run.");
        }
      },
      runVerification: async () => {
        if (verifier.kind !== "command") {
          return toVerificationResult(verifier);
        }

        return runVerificationCommand({
          cwd: runtime.cwd,
          command: verifier.command,
        });
      },
    });

    writeStdout(`${result.summary}\n`);
    return result.status === "succeeded" ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    await runtime.dispose();
  }
}
