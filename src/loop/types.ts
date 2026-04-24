export type VerificationResult =
  | {
      kind: "pass";
      command: string;
      exitCode: 0;
      summary: string;
      artifactPath?: string;
      stdout?: string;
      stderr?: string;
    }
  | {
      kind: "fail";
      command: string;
      exitCode: number;
      summary: string;
      artifactPath?: string;
      stdout?: string;
      stderr?: string;
    }
  | {
      kind: "incomplete" | "unavailable";
      command?: string;
      exitCode?: number;
      summary: string;
      artifactPath?: string;
      stdout?: string;
      stderr?: string;
    };

export type VerificationCommandResolution =
  | {
      kind: "command";
      command: string;
      source: string;
    }
  | {
      kind: "incomplete" | "unavailable";
      source?: string;
      summary: string;
    };

export type LoopExecutionStatus = "succeeded" | "handoff" | "failed";

export type LoopRoundRecord = {
  round: number;
  verification: VerificationResult;
};

export type LoopControllerResult = {
  status: LoopExecutionStatus;
  rounds: LoopRoundRecord[];
  summary: string;
};

export type LoopFailureMode = "handoff" | "fail";
