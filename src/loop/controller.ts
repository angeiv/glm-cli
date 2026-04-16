import type { LoopProfile } from "./profiles/types.js";
import type {
  LoopControllerResult,
  LoopFailureMode,
  LoopRoundRecord,
  VerificationResult,
} from "./types.js";

export type RunLoopControllerInput = {
  task: string;
  maxRounds: number;
  failureMode: LoopFailureMode;
  profile: LoopProfile;
  executeTurn: (message: string, round: number) => Promise<void>;
  runVerification: (round: number) => Promise<VerificationResult>;
};

function buildTerminalResult(args: {
  task: string;
  status: LoopControllerResult["status"];
  profile: LoopProfile;
  rounds: LoopRoundRecord[];
  lastResult: VerificationResult;
}): LoopControllerResult {
  return {
    status: args.status,
    rounds: args.rounds,
    summary: args.profile.buildHandoffSummary({
      task: args.task,
      rounds: args.rounds,
      lastResult: args.lastResult,
      status: args.status,
    }),
  };
}

export async function runLoopController(
  input: RunLoopControllerInput,
): Promise<LoopControllerResult> {
  const rounds: LoopRoundRecord[] = [];

  await input.executeTurn(input.profile.buildLoopContract(input.task), 1);

  for (let round = 1; round <= input.maxRounds; round++) {
    const verification = await input.runVerification(round);
    rounds.push({ round, verification });

    if (verification.kind === "pass") {
      return {
        status: "succeeded",
        rounds,
        summary: input.profile.buildSuccessSummary(rounds),
      };
    }

    const canRepairAgain =
      verification.kind === "fail" && round < input.maxRounds;
    if (canRepairAgain) {
      await input.executeTurn(
        input.profile.buildRepairPrompt(verification, round + 1),
        round + 1,
      );
      continue;
    }

    const status = input.failureMode === "fail" ? "failed" : "handoff";
    return buildTerminalResult({
      task: input.task,
      status,
      profile: input.profile,
      rounds,
      lastResult: verification,
    });
  }

  const lastResult =
    rounds[rounds.length - 1]?.verification ??
    ({
      kind: "unavailable",
      summary: "Loop ended before verification completed.",
    } satisfies VerificationResult);

  return buildTerminalResult({
    task: input.task,
    status: input.failureMode === "fail" ? "failed" : "handoff",
    profile: input.profile,
    rounds,
    lastResult,
  });
}
