import { spawn } from "node:child_process";
import type { VerificationResult } from "./types.js";

function summarizeOutput(stdout: string, stderr: string): string | undefined {
  for (const line of `${stderr}\n${stdout}`.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return undefined;
}

export async function runVerificationCommand(args: {
  cwd: string;
  command?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<VerificationResult> {
  const command = args.command?.trim();
  if (!command) {
    return {
      kind: "unavailable",
      summary: "No verification command is configured for the current loop run.",
    };
  }

  const shell = process.env.SHELL || "/bin/sh";

  return new Promise<VerificationResult>((resolve) => {
    const child = spawn(shell, ["-lc", command], {
      cwd: args.cwd,
      env: { ...process.env, ...args.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({
        kind: "unavailable",
        command,
        summary: error.message,
        stderr: error.message,
      });
    });

    child.on("close", (code, signal) => {
      const summary =
        summarizeOutput(stdout, stderr) ??
        (signal
          ? `Verification command terminated by signal ${signal}.`
          : code === 0
            ? "Verification passed."
            : `Verification failed with exit code ${code ?? 1}.`);

      if (code === 0) {
        resolve({
          kind: "pass",
          command,
          exitCode: 0,
          summary,
          stdout,
          stderr,
        });
        return;
      }

      resolve({
        kind: "fail",
        command,
        exitCode: code ?? 1,
        summary,
        stdout,
        stderr,
      });
    });
  });
}
