import type { ApprovalPolicy, LoopFailureMode, LoopProfileName } from "../app/config-store.js";
import type { RuntimeToolSignature } from "./tool-signature.js";

export type RuntimeDiagnosticsConfig = {
  debugRuntime: boolean;
  eventLogLimit: number;
};

export type RuntimeSettingsSource = "default" | "global" | "project";

export type RuntimeCompactionStatus = {
  enabled: boolean;
  reserveTokens: number;
  keepRecentTokens: number;
  settingsPaths: {
    global: string;
    project: string;
  };
  sources: {
    enabled: RuntimeSettingsSource;
    reserveTokens: RuntimeSettingsSource;
    keepRecentTokens: RuntimeSettingsSource;
  };
  errors?: {
    global?: string;
    project?: string;
  };
};

export type RuntimeLoopStatus = {
  enabled: boolean;
  profile: LoopProfileName;
  maxRounds: number;
  maxToolCalls?: number;
  maxVerifyRuns?: number;
  roundsUsed?: number;
  toolCallsUsed?: number;
  verifyRunsUsed?: number;
  mode?: "manual" | "auto";
  phase?: "run" | "verify" | "repair";
  failureMode: LoopFailureMode;
  autoVerify: boolean;
  verifyCommand?: string;
  verifyFallbackCommand?: string;
};

export type RuntimeMcpStatus = {
  enabled: boolean;
  configPath: string;
  cachePath: string;
  configuredServerCount: number;
  modeCounts: {
    direct: number;
    proxy: number;
    hybrid: number;
  };
};

export type RuntimeNotificationStatus = {
  enabled: boolean;
  onTurnEnd: boolean;
  onLoopResult: boolean;
};

export type RuntimeVerificationStatus = {
  latest?: {
    artifactPath: string;
    createdAt: string;
    scenario?: string;
    kind: string;
    command?: string;
    exitCode?: number;
    summary: string;
  };
};

export type RuntimePaths = {
  agentDir: string;
  sessionDir: string;
  authPath: string;
  modelsPath: string;
};

export type RuntimeResolvedModelStatus = {
  canonicalModelId?: string;
  platform: string;
  upstreamVendor: string;
  payloadPatchPolicy: "glm-native" | "safe-openai-compatible";
  confidence: "high" | "medium" | "low";
  contextWindow: number;
  maxOutputTokens: number;
  supportsThinking: boolean;
  supportsPreservedThinking: boolean;
  supportsStreaming: boolean;
  supportsToolCall: boolean;
  supportsToolStream: boolean;
  supportsCache: boolean;
  supportsStructuredOutput: boolean;
  supportsMcp: boolean;
};

export type RuntimeGenerationStatus = {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
};

export type RuntimeGlmCapabilitiesStatus = {
  thinkingMode?: string;
  clearThinking?: boolean;
  toolStream?: string;
  responseFormat?: string;
};

export type RuntimeStatus = {
  cwd: string;
  provider: string;
  api: string;
  model: string;
  baseUrl?: string;
  resolvedModel: RuntimeResolvedModelStatus;
  generation: RuntimeGenerationStatus;
  glmCapabilities: RuntimeGlmCapabilitiesStatus;
  toolSignature: RuntimeToolSignature;
  approvalPolicy: ApprovalPolicy;
  loop: RuntimeLoopStatus;
  compaction: RuntimeCompactionStatus;
  diagnostics: RuntimeDiagnosticsConfig & {
    eventCount: number;
  };
  notifications: RuntimeNotificationStatus;
  mcp: RuntimeMcpStatus;
  verification: RuntimeVerificationStatus;
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
