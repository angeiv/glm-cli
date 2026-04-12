import { runPrintMode, type AgentSessionRuntime } from "@mariozechner/pi-coding-agent";

export async function runSingleTask(
  runtime: AgentSessionRuntime,
  task: string,
): Promise<number> {
  return runPrintMode(runtime, {
    mode: "text",
    initialMessage: task,
    initialImages: [],
  });
}
