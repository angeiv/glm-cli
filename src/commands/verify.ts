import { readConfigFile, type GlmConfigFile } from "../app/config-store.js";
import {
  formatVerificationArtifactReference,
  writeVerificationArtifact,
  type VerificationArtifact,
} from "../harness/artifacts.js";
import { detectCodeVerifier } from "../loop/verify-detect.js";
import { runVerificationCommand } from "../loop/verify-runner.js";
import type { VerificationCommandResolution, VerificationResult } from "../loop/types.js";
import { resolveVerifyScenario, type VerifyScenarioName } from "../harness/scenarios.js";

export type VerifyCommandArgs = {
  cwd: string;
  scenario?: VerifyScenarioName;
  verify?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

type VerifyResolution = {
  resolution: VerificationCommandResolution;
  verification: VerificationResult;
  artifact: VerificationArtifact;
  artifactPath: string;
  artifactRef: NonNullable<VerificationResult["artifactRef"]>;
};

type VerifyDependencies = {
  readConfigFile: () => Promise<GlmConfigFile>;
  detectVerifier: (cwd: string) => Promise<VerificationCommandResolution>;
  runVerificationCommand: (args: {
    cwd: string;
    command?: string;
    env?: NodeJS.ProcessEnv;
  }) => Promise<VerificationResult>;
  resolveScenario: typeof resolveVerifyScenario;
  log: (message: string) => void;
  writeArtifact: typeof writeVerificationArtifact;
};

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

  const resolution =
    (await (deps?.resolveScenario ?? resolveVerifyScenario)({
      cwd: input.cwd,
      scenario: input.scenario,
      detectVerifier: deps?.detectVerifier ?? detectCodeVerifier,
    })) ??
    (await resolveVerifier({
      cwd: input.cwd,
      explicit: input.verify ?? envVerifyCommand,
      fallback: envVerifyFallbackCommand ?? config.loop.verifyCommand,
      detectVerifier: deps?.detectVerifier ?? detectCodeVerifier,
    }));

  if (resolution.kind !== "command") {
    const verification: VerificationResult = {
      kind: resolution.kind,
      summary: resolution.summary,
    };
    const artifactResult = await (deps?.writeArtifact ?? writeVerificationArtifact)({
      cwd: input.cwd,
      scenario: input.scenario,
      resolution,
      verification,
    });

    return {
      resolution,
      verification: {
        ...verification,
        artifactPath: artifactResult.artifactPath,
        artifactRef: artifactResult.artifactRef,
      },
      ...artifactResult,
    };
  }

  const verification = await (deps?.runVerificationCommand ?? runVerificationCommand)({
    cwd: input.cwd,
    command: resolution.command,
    env,
  });
  const artifactResult = await (deps?.writeArtifact ?? writeVerificationArtifact)({
    cwd: input.cwd,
    scenario: input.scenario,
    resolution,
    verification,
  });

  return {
    resolution,
    verification: {
      ...verification,
      artifactPath: artifactResult.artifactPath,
      artifactRef: artifactResult.artifactRef,
    },
    ...artifactResult,
  };
}

export async function runVerifyCommand(
  input: VerifyCommandArgs,
  deps?: Partial<VerifyDependencies>,
): Promise<number> {
  const log = deps?.log ?? console.log;
  const { resolution, verification, artifact, artifactPath } = await verifyProject(input, deps);
  const artifactRef = verification.artifactRef;

  if (input.json) {
    log(JSON.stringify({ resolution, verification, artifact, artifactPath, artifactRef }, null, 2));
    return verification.kind === "pass" ? 0 : 1;
  }

  const lines = [
    resolution.kind === "command"
      ? `Verifier: ${resolution.command} (${resolution.source})`
      : `Verifier: ${resolution.summary}`,
    `Result: ${verification.kind}`,
    `Summary: ${verification.summary}`,
    ...(artifactRef
      ? formatVerificationArtifactReference(artifactRef)
      : [`Artifact reference: verification | ${artifactPath}`]),
  ];

  log(lines.join("\n"));
  return verification.kind === "pass" ? 0 : 1;
}
