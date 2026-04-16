import type {
  LoopControllerResult,
  LoopRoundRecord,
  VerificationResult,
} from "../types.js";

export type LoopProfile = {
  name: "code";
  buildLoopContract(task: string): string;
  buildRepairPrompt(result: VerificationResult, nextRound: number): string;
  buildSuccessSummary(rounds: LoopRoundRecord[]): string;
  buildHandoffSummary(args: {
    task: string;
    rounds: LoopRoundRecord[];
    lastResult: VerificationResult;
    status: LoopControllerResult["status"];
  }): string;
};
