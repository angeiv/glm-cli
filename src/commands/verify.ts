import { readConfigFile, type GlmConfigFile } from "../app/config-store.js";
import { detectCodeVerifier } from "../loop/verify-detect.js";
import { runVerificationCommand } from "../loop/verify-runner.js";
import type {
  VerificationCommandResolution,
  VerificationResult,
} from "../loop/types.js";

export type VerifyCommandArgs = {
  cwd: string;
  verify?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

type VerifyResolution = {
  resolution: VerificationCommandResolution;
  verification: VerificationResult;
};

type VerifyDependencies = {
  readConfigFile: () => Promise<GlmConfigFile>;
  detectVerifier: (cwd: string) => Promise<VerificationCommandResolution>;
  runVerificationCommand: (args: {
    cwd: string;
    command?: string;
    env?: NodeJS.ProcessEnv;
  }) => Promise<VerificationResult>;
  log: (message: string) => void;
};

function summarizeOutputText(
  value: string | undefined,
  maxLines = 2,
  maxChars = 160,
): string | undefined {
  if (!value) return undefined;
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);
  if (lines.length === 0) return undefined;

  const summary = lines.join(" | ");
  if (summary.length <= maxChars) {
    return summary;
  }

  return `${summary.slice(0, maxChars - 1)}…`;
}

async function resolveVerifier(args: {
  cwd: string;
  explicit?: string;
  fallback?: string;
  detectVerifier: (cwd: string) => Promise<VerificationCommandResolution>;
}): Promise<VerificationCommandResolution> {
  const explicit = args.explicit?.trim();
  if (explicit) {
    return { kind: "command", command: explicit, source: "explicit" };
  }

  const detected = await args.detectVerifier(args.cwd);
  if (detected.kind === "command") {
    return detected;
  }

  const fallback = args.fallback?.trim();
  if (fallback) {
    return { kind: "command", command: fallback, source: "fallback" };
  }

  return detected;
}

export async function verifyProject(
  input: VerifyCommandArgs,
  deps?: Partial<VerifyDependencies>,
): Promise<VerifyResolution> {
  const env = input.env ?? process.env;
  const config = await (deps?.readConfigFile ?? readConfigFile)();

  const envVerifyCommand = env.GLM_LOOP_VERIFY_COMMAND;
  const envVerifyFallbackCommand = env.GLM_LOOP_VERIFY_FALLBACK_COMMAND;

  const resolution = await resolveVerifier({
    cwd: input.cwd,
    explicit: input.verify ?? envVerifyCommand,
    fallback: envVerifyFallbackCommand ?? config.loop.verifyCommand,
    detectVerifier: deps?.detectVerifier ?? detectCodeVerifier,
  });

  if (resolution.kind !== "command") {
    return {
      resolution,
      verification: {
        kind: resolution.kind,
        summary: resolution.summary,
      },
    };
  }

  const verification = await (deps?.runVerificationCommand ?? runVerificationCommand)({
    cwd: input.cwd,
    command: resolution.command,
    env,
  });

  return { resolution, verification };
}

export async function runVerifyCommand(
  input: VerifyCommandArgs,
  deps?: Partial<VerifyDependencies>,
): Promise<number> {
  const log = deps?.log ?? console.log;
  const { resolution, verification } = await verifyProject(input, deps);

  if (input.json) {
    log(JSON.stringify({ resolution, verification }, null, 2));
    return verification.kind === "pass" ? 0 : 1;
  }

  const stdoutSummary = summarizeOutputText(verification.stdout);
  const stderrSummary = summarizeOutputText(verification.stderr);

  const lines = [
    resolution.kind === "command"
      ? `Verifier: ${resolution.command} (${resolution.source})`
      : `Verifier: ${resolution.summary}`,
    `Result: ${verification.kind}`,
    `Summary: ${verification.summary}`,
    ...(verification.exitCode === undefined ? [] : [`Exit code: ${verification.exitCode}`]),
    ...(stdoutSummary ? [`Stdout summary: ${stdoutSummary}`] : []),
    ...(stderrSummary ? [`Stderr summary: ${stderrSummary}`] : []),
  ];

  log(lines.join("\n"));
  return verification.kind === "pass" ? 0 : 1;
}
