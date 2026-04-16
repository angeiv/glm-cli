import type { LoopProfile } from "./profiles/types.js";
import type { LoopControllerResult, LoopRoundRecord, VerificationResult } from "./types.js";

export function buildLoopFailureSummary(args: {
  task: string;
  status: Exclude<LoopControllerResult["status"], "succeeded">;
  profile: LoopProfile;
  rounds: LoopRoundRecord[];
  lastResult: VerificationResult;
}): string {
  return args.profile.buildHandoffSummary({
    task: args.task,
    rounds: args.rounds,
    lastResult: args.lastResult,
    status: args.status,
  });
}
