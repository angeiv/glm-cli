import type {
  ApprovalPolicy,
  LoopFailureMode,
  LoopProfileName,
} from "../app/config-store.js";

export type RuntimeDiagnosticsConfig = {
  debugRuntime: boolean;
  eventLogLimit: number;
};

export type RuntimeLoopStatus = {
  enabled: boolean;
  profile: LoopProfileName;
  maxRounds: number;
  failureMode: LoopFailureMode;
  autoVerify: boolean;
  verifyCommand?: string;
  verifyFallbackCommand?: string;
};

export type RuntimeMcpStatus = {
  enabled: boolean;
  configPath: string;
  configuredServerCount: number;
};

export type RuntimePaths = {
  agentDir: string;
  sessionDir: string;
  authPath: string;
  modelsPath: string;
};

export type RuntimeStatus = {
  cwd: string;
  provider: string;
  model: string;
  approvalPolicy: ApprovalPolicy;
  loop: RuntimeLoopStatus;
  diagnostics: RuntimeDiagnosticsConfig & {
    eventCount: number;
  };
  mcp: RuntimeMcpStatus;
  paths: RuntimePaths;
};

export type RuntimeEventLevel = "info" | "warn" | "error";

export type RuntimeEvent = {
  id: number;
  at: string;
  type: string;
  summary: string;
  level: RuntimeEventLevel;
  details?: Record<string, unknown>;
};
