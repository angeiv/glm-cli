import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ReadonlySessionManager,
  SessionEntry,
} from "@mariozechner/pi-coding-agent";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { appendRuntimeEvent } from "../shared/runtime-state.js";

type LoopProfileName = "code";
type LoopFailureMode = "handoff" | "fail";
type LoopExecutionStatus = "succeeded" | "handoff" | "failed";
type LoopPhase = "run" | "verify" | "repair";
type VerificationResult =
  | {
      kind: "pass";
      command: string;
      exitCode: 0;
      summary: string;
      stdout?: string;
      stderr?: string;
    }
  | {
      kind: "fail";
      command: string;
      exitCode: number;
      summary: string;
      stdout?: string;
      stderr?: string;
    }
  | {
      kind: "incomplete" | "unavailable";
      command?: string;
      summary: string;
      stdout?: string;
      stderr?: string;
    };

type VerificationCommandResolution =
  | {
      kind: "command";
      command: string;
      source: string;
    }
  | {
      kind: "incomplete" | "unavailable";
      summary: string;
      source?: string;
    };

type LoopState = {
  enabled: boolean;
  profile: LoopProfileName;
  maxRounds: number;
  failureMode: LoopFailureMode;
  autoVerify: boolean;
  verifyCommand?: string;
};

type LoopVerificationRecord = {
  kind: VerificationResult["kind"];
  command?: string;
  exitCode?: number;
  summary: string;
  stdoutSummary?: string;
  stderrSummary?: string;
};

type LoopResultRecord = {
  status: LoopExecutionStatus;
  task: string;
  rounds: number;
  verification: LoopVerificationRecord;
  outcome: string;
  completedAt: string;
};

type ActiveLoopSession =
  | {
      mode: "manual";
      task: string;
      phase: LoopPhase;
      currentRound: number;
      maxRounds: number;
    }
  | {
      mode: "auto";
      task: string;
      phase: LoopPhase;
      currentRound: number;
      rounds: VerificationResult[];
      state: LoopState;
      verifier: VerificationCommandResolution;
      announceSuccess: boolean;
    };

const LOOP_STATE_ENTRY = "glm.loop.state";
const LOOP_RESULT_ENTRY = "glm.loop.result";
const LOOP_MESSAGE_TYPE = "glm.loop";
const LOOP_STATUS_KEY = "glm.loop";
const activeLoops = new Map<string, ActiveLoopSession>();
const terminalLoopStatuses = new Map<string, string>();

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return fallback;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function readDefaultState(env: NodeJS.ProcessEnv): LoopState {
  const failureMode =
    env.GLM_LOOP_FAILURE_MODE === "fail" ? "fail" : "handoff";
  const profile = env.GLM_LOOP_PROFILE === "code" ? "code" : "code";

  return {
    enabled: parseBoolean(env.GLM_LOOP_ENABLED, false),
    profile,
    maxRounds: parsePositiveInteger(env.GLM_LOOP_MAX_ROUNDS, 3),
    failureMode,
    autoVerify: parseBoolean(env.GLM_LOOP_AUTO_VERIFY, true),
    ...(env.GLM_LOOP_VERIFY_COMMAND?.trim()
      ? { verifyCommand: env.GLM_LOOP_VERIFY_COMMAND.trim() }
      : {}),
  };
}

function isLoopState(value: unknown): value is LoopState {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<LoopState>;
  return (
    typeof maybe.enabled === "boolean" &&
    maybe.profile === "code" &&
    typeof maybe.maxRounds === "number" &&
    Number.isInteger(maybe.maxRounds) &&
    maybe.maxRounds > 0 &&
    (maybe.failureMode === "handoff" || maybe.failureMode === "fail") &&
    typeof maybe.autoVerify === "boolean" &&
    (maybe.verifyCommand === undefined || typeof maybe.verifyCommand === "string")
  );
}

function readPersistedState(
  sessionManager: ReadonlySessionManager,
  fallback: LoopState,
): LoopState {
  const entries = sessionManager.getEntries();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i] as SessionEntry & { customType?: string; data?: unknown };
    if (entry.type !== "custom") continue;
    if (entry.customType !== LOOP_STATE_ENTRY) continue;
    if (isLoopState(entry.data)) {
      return entry.data;
    }
  }

  return fallback;
}

function isLoopResultRecord(value: unknown): value is LoopResultRecord {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<LoopResultRecord>;
  const verification = maybe.verification as Partial<LoopVerificationRecord> | undefined;
  return (
    (maybe.status === "succeeded" ||
      maybe.status === "handoff" ||
      maybe.status === "failed") &&
    typeof maybe.task === "string" &&
    typeof maybe.rounds === "number" &&
    Number.isInteger(maybe.rounds) &&
    maybe.rounds >= 0 &&
    !!verification &&
    (verification.kind === "pass" ||
      verification.kind === "fail" ||
      verification.kind === "incomplete" ||
      verification.kind === "unavailable") &&
    (verification.command === undefined || typeof verification.command === "string") &&
    (verification.exitCode === undefined || typeof verification.exitCode === "number") &&
    typeof verification.summary === "string" &&
    (verification.stdoutSummary === undefined || typeof verification.stdoutSummary === "string") &&
    (verification.stderrSummary === undefined || typeof verification.stderrSummary === "string") &&
    typeof maybe.outcome === "string" &&
    typeof maybe.completedAt === "string"
  );
}

type LegacyLoopResultRecord = {
  status: LoopExecutionStatus;
  task: string;
  rounds: number;
  verifier?: string;
  summary: string;
  outcome: string;
  completedAt: string;
};

function isLegacyLoopResultRecord(value: unknown): value is LegacyLoopResultRecord {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<LegacyLoopResultRecord>;
  return (
    (maybe.status === "succeeded" ||
      maybe.status === "handoff" ||
      maybe.status === "failed") &&
    typeof maybe.task === "string" &&
    typeof maybe.rounds === "number" &&
    Number.isInteger(maybe.rounds) &&
    maybe.rounds >= 0 &&
    (maybe.verifier === undefined || typeof maybe.verifier === "string") &&
    typeof maybe.summary === "string" &&
    typeof maybe.outcome === "string" &&
    typeof maybe.completedAt === "string"
  );
}

function normalizeLoopResultRecord(value: unknown): LoopResultRecord | undefined {
  if (isLoopResultRecord(value)) {
    return value;
  }

  if (isLegacyLoopResultRecord(value)) {
    return {
      status: value.status,
      task: value.task,
      rounds: value.rounds,
      verification: {
        kind:
          value.status === "succeeded"
            ? "pass"
            : value.status === "failed" || value.status === "handoff"
              ? "fail"
              : "unavailable",
        ...(value.verifier ? { command: value.verifier } : {}),
        summary: value.summary,
      },
      outcome: value.outcome,
      completedAt: value.completedAt,
    };
  }

  return undefined;
}

function readPersistedResult(
  sessionManager: ReadonlySessionManager,
): LoopResultRecord | undefined {
  return readPersistedResults(sessionManager)[0];
}

function readPersistedResults(
  sessionManager: ReadonlySessionManager,
): LoopResultRecord[] {
  const entries = sessionManager.getEntries();
  const results: LoopResultRecord[] = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i] as SessionEntry & { customType?: string; data?: unknown };
    if (entry.type !== "custom") continue;
    if (entry.customType !== LOOP_RESULT_ENTRY) continue;
    const normalized = normalizeLoopResultRecord(entry.data);
    if (normalized) {
      results.push(normalized);
    }
  }

  return results.sort((left, right) =>
    right.completedAt.localeCompare(left.completedAt),
  );
}

function persistLoopState(pi: ExtensionAPI, state: LoopState): void {
  pi.appendEntry(LOOP_STATE_ENTRY, state);
}

function persistLoopResult(pi: ExtensionAPI, result: LoopResultRecord): void {
  pi.appendEntry(LOOP_RESULT_ENTRY, result);
}

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

function createLoopVerificationRecord(
  result: VerificationResult,
): LoopVerificationRecord {
  return {
    kind: result.kind,
    ...(result.command ? { command: result.command } : {}),
    ...(result.exitCode === undefined ? {} : { exitCode: result.exitCode }),
    summary: result.summary,
    ...(summarizeOutputText(result.stdout)
      ? { stdoutSummary: summarizeOutputText(result.stdout) }
      : {}),
    ...(summarizeOutputText(result.stderr)
      ? { stderrSummary: summarizeOutputText(result.stderr) }
      : {}),
  };
}

function createLoopResultRecord(args: {
  status: LoopExecutionStatus;
  task: string;
  rounds: number;
  verification: VerificationResult;
  outcome: string;
}): LoopResultRecord {
  return {
    status: args.status,
    task: args.task,
    rounds: args.rounds,
    verification: createLoopVerificationRecord(args.verification),
    outcome: args.outcome,
    completedAt: new Date().toISOString(),
  };
}

function emitLoopMessage(pi: ExtensionAPI, lines: string[]): void {
  pi.sendMessage({
    customType: LOOP_MESSAGE_TYPE,
    content: lines.join("\n"),
    display: true,
    details: {},
  });
}

function getCurrentRound(active: ActiveLoopSession): number {
  return active.currentRound;
}

function getMaxRounds(active: ActiveLoopSession): number {
  if (active.mode === "manual") {
    return active.maxRounds;
  }

  return active.state.maxRounds;
}

function buildActiveLoopLines(active: ActiveLoopSession): string[] {
  if (active.mode === "manual") {
    return [
      "Active loop: manual",
      `Task: ${active.task}`,
      `Phase: ${active.phase}`,
      `Current round: ${getCurrentRound(active)} / ${getMaxRounds(active)}`,
    ];
  }

  return [
    "Active loop: auto",
    `Task: ${active.task}`,
    `Phase: ${active.phase}`,
    `Current round: ${getCurrentRound(active)} / ${getMaxRounds(active)}`,
    `Verifier source: ${active.verifier.source ?? "none"}`,
    active.verifier.kind === "command"
      ? `Verifier: ${active.verifier.command}`
      : `Verifier: ${active.verifier.summary}`,
  ];
}

function buildLastResultLines(result: LoopResultRecord): string[] {
  return [
    `Last status: ${result.status}`,
    `Last task: ${result.task}`,
    `Last rounds: ${result.rounds}`,
    result.verification.command ? `Last verifier: ${result.verification.command}` : undefined,
    `Last verification: ${result.verification.kind}`,
    `Last summary: ${result.verification.summary}`,
    result.verification.stdoutSummary
      ? `Last stdout summary: ${result.verification.stdoutSummary}`
      : undefined,
    result.verification.stderrSummary
      ? `Last stderr summary: ${result.verification.stderrSummary}`
      : undefined,
    `Last outcome: ${result.outcome.split("\n")[0]}`,
  ].filter(Boolean) as string[];
}

function buildHistoryLines(results: LoopResultRecord[], limit: number): string[] {
  const visible = results.slice(0, limit);
  if (visible.length === 0) {
    return ["Recent loop results: 0", "No loop results recorded in this session yet."];
  }

  const lines = [`Recent loop results: ${visible.length}`];
  for (let i = 0; i < visible.length; i++) {
    const result = visible[i];
    lines.push(
      `${i + 1}. ${result.status} | ${result.task} | rounds ${result.rounds}`,
    );
    lines.push(
      result.verification.command
        ? `   verifier: ${result.verification.command}`
        : "   verifier: unavailable",
    );
    lines.push(`   summary: ${result.verification.summary}`);
  }
  return lines;
}

function buildShowLines(
  results: LoopResultRecord[],
  index: number,
): string[] {
  const result = results[index - 1];
  if (!result) {
    return [`Loop result #${index} was not found.`];
  }

  return [
    `Loop result #${index}`,
    `Status: ${result.status}`,
    `Task: ${result.task}`,
    `Rounds: ${result.rounds}`,
    result.verification.command
      ? `Verifier: ${result.verification.command}`
      : "Verifier: unavailable",
    `Verification kind: ${result.verification.kind}`,
    ...(result.verification.exitCode === undefined
      ? []
      : [`Exit code: ${result.verification.exitCode}`]),
    `Summary: ${result.verification.summary}`,
    ...(result.verification.stdoutSummary
      ? [`Stdout summary: ${result.verification.stdoutSummary}`]
      : []),
    ...(result.verification.stderrSummary
      ? [`Stderr summary: ${result.verification.stderrSummary}`]
      : []),
    `Outcome: ${result.outcome}`,
    `Completed at: ${result.completedAt}`,
  ];
}

function buildStatusLines(
  state: LoopState,
  active?: ActiveLoopSession,
  lastResult?: LoopResultRecord,
): string[] {
  const lines = [
    `Loop ${state.enabled ? "armed" : "disabled"} for this session.`,
    `Profile: ${state.profile}`,
    `Max rounds: ${state.maxRounds}`,
    `Failure mode: ${state.failureMode}`,
    `Auto verify: ${state.autoVerify ? "on" : "off"}`,
    `Verifier: ${state.verifyCommand?.trim() || "auto-detect"}`,
  ];

  if (!active) {
    return lastResult ? [...lines, "", ...buildLastResultLines(lastResult)] : lines;
  }

  return [
    ...lines,
    "",
    ...buildActiveLoopLines(active),
    ...(lastResult ? ["", ...buildLastResultLines(lastResult)] : []),
  ];
}

function getActiveLoop(sessionManager: ReadonlySessionManager): ActiveLoopSession | undefined {
  const sessionId = sessionManager.getSessionId();
  if (!sessionId) {
    return undefined;
  }

  return activeLoops.get(sessionId);
}

function clearLoopTerminalStatus(sessionManager: ReadonlySessionManager): void {
  const sessionId = sessionManager.getSessionId();
  if (!sessionId) {
    return;
  }

  terminalLoopStatuses.delete(sessionId);
}

function setLoopTerminalStatus(
  sessionManager: ReadonlySessionManager,
  text: string,
): void {
  const sessionId = sessionManager.getSessionId();
  if (!sessionId) {
    return;
  }

  terminalLoopStatuses.set(sessionId, text);
}

function getLoopTerminalStatus(
  sessionManager: ReadonlySessionManager,
): string | undefined {
  const sessionId = sessionManager.getSessionId();
  if (!sessionId) {
    return undefined;
  }

  return terminalLoopStatuses.get(sessionId);
}

function formatActiveLoopStatus(active: ActiveLoopSession): string {
  return `loop ${active.mode} ${active.phase} r${getCurrentRound(active)}/${getMaxRounds(active)}`;
}

function setActiveLoopPhase(
  sessionManager: ReadonlySessionManager,
  phase: LoopPhase,
  currentRound?: number,
): void {
  const active = getActiveLoop(sessionManager);
  if (!active) {
    return;
  }

  active.phase = phase;
  if (currentRound !== undefined) {
    active.currentRound = currentRound;
  }
}

function setLoopStatus(
  ctx: Pick<ExtensionContext, "ui">,
  text: string | undefined,
): void {
  const setStatus = (ctx.ui as { setStatus?: (key: string, text: string | undefined) => void })
    .setStatus;
  if (typeof setStatus === "function") {
    setStatus(LOOP_STATUS_KEY, text);
  }
}

function refreshLoopStatus(
  ctx: Pick<ExtensionContext, "sessionManager" | "ui">,
  state?: LoopState,
): void {
  const resolvedState =
    state ?? readPersistedState(ctx.sessionManager, readDefaultState(process.env));
  const active = getActiveLoop(ctx.sessionManager);

  if (active?.mode === "manual") {
    setLoopStatus(ctx, formatActiveLoopStatus(active));
    return;
  }

  if (active?.mode === "auto") {
    setLoopStatus(ctx, formatActiveLoopStatus(active));
    return;
  }

  const terminalStatus = getLoopTerminalStatus(ctx.sessionManager);
  if (terminalStatus) {
    setLoopStatus(ctx, terminalStatus);
    return;
  }

  setLoopStatus(ctx, resolvedState.enabled ? "loop armed" : undefined);
}

function buildLoopContract(task: string): string {
  return [
    "You are running inside glm's explicit delivery-quality loop for code work.",
    "Task:",
    task,
    "",
    "Requirements:",
    "- First create a short plan for the task.",
    "- Then make the minimal code changes needed.",
    "- Do not claim completion until external verification passes.",
    "- If verification fails, focus only on the reported failure.",
  ].join("\n");
}

function buildRepairPrompt(result: VerificationResult, nextRound: number): string {
  return [
    `Verification failed. Begin repair round ${nextRound}.`,
    result.command ? `Verifier: ${result.command}` : "Verifier: unavailable",
    `Summary: ${result.summary}`,
    "",
    "Instructions:",
    "- Fix only the failure reported by the verifier.",
    "- Avoid unrelated refactors or new feature work.",
    "- When done, stop and wait for the next verification step.",
  ].join("\n");
}

function buildSuccessSummary(rounds: VerificationResult[]): string {
  const totalRounds = rounds.length;
  const last = rounds[rounds.length - 1];
  return [
    `Loop succeeded after ${totalRounds} round${totalRounds === 1 ? "" : "s"}.`,
    last?.command ? `Verifier: ${last.command}` : undefined,
    `Summary: ${last?.summary ?? "verification passed"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildFailureSummary(args: {
  task: string;
  status: LoopExecutionStatus;
  rounds: VerificationResult[];
  lastResult: VerificationResult;
}): string {
  return [
    args.status === "failed"
      ? "Loop stopped with failure."
      : "Loop stopped and requires human handoff.",
    `Task: ${args.task}`,
    `Rounds attempted: ${args.rounds.length}`,
    args.lastResult.command ? `Last verifier: ${args.lastResult.command}` : undefined,
    `Last result: ${args.lastResult.summary}`,
    "Recommended next step: inspect the latest verifier output, apply a focused fix, and rerun verification.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readTextFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

function detectNodePackageManager(
  pkg: Record<string, unknown>,
): "pnpm" | "npm" | "yarn" | "bun" {
  const raw = typeof pkg.packageManager === "string" ? pkg.packageManager : "";
  if (raw.startsWith("pnpm@")) return "pnpm";
  if (raw.startsWith("yarn@")) return "yarn";
  if (raw.startsWith("bun@")) return "bun";
  return "npm";
}

function hasScript(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

async function detectCodeVerifier(cwd: string): Promise<VerificationCommandResolution> {
  const packageJson = await readTextFile(`${cwd}/package.json`);
  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson) as Record<string, unknown>;
      const scripts =
        pkg.scripts && typeof pkg.scripts === "object"
          ? (pkg.scripts as Record<string, unknown>)
          : {};

      if (hasScript(scripts.test)) {
        return {
          kind: "command",
          command: `${detectNodePackageManager(pkg)} test`,
          source: "package.json",
        };
      }

      if (
        hasScript(scripts.lint) ||
        hasScript(scripts.build) ||
        hasScript(scripts.typecheck) ||
        hasScript(scripts.check)
      ) {
        return {
          kind: "incomplete",
          source: "package.json",
          summary:
            "No high-confidence test command was found. The project only exposes lower-confidence checks such as lint, build, or typecheck.",
        };
      }
    } catch {
      // Ignore invalid package.json and continue other detectors.
    }
  }

  if (await fileExists(`${cwd}/pytest.ini`)) {
    return { kind: "command", command: "pytest", source: "pytest.ini" };
  }

  const pyproject = await readTextFile(`${cwd}/pyproject.toml`);
  if (
    pyproject &&
    (pyproject.includes("[tool.pytest") || pyproject.includes("pytest"))
  ) {
    return { kind: "command", command: "pytest", source: "pyproject.toml" };
  }

  if (await fileExists(`${cwd}/go.mod`)) {
    return { kind: "command", command: "go test ./...", source: "go.mod" };
  }

  if (await fileExists(`${cwd}/Cargo.toml`)) {
    return { kind: "command", command: "cargo test", source: "Cargo.toml" };
  }

  return {
    kind: "unavailable",
    summary:
      "No supported high-confidence verifier could be detected for this project.",
  };
}

async function runVerification(
  pi: ExtensionAPI,
  ctx: {
    cwd: string;
  },
  command: string,
): Promise<VerificationResult> {
  const shell = process.env.SHELL || "/bin/sh";
  const result = await pi.exec(shell, ["-lc", command], {
    cwd: ctx.cwd,
    timeout: 10 * 60 * 1000,
  });

  const combined = `${result.stderr}\n${result.stdout}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  const summary =
    combined ||
    (result.code === 0
      ? "Verification passed."
      : `Verification failed with exit code ${result.code}.`);

  if (result.code === 0) {
    return {
      kind: "pass",
      command,
      exitCode: 0,
      summary,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  return {
    kind: "fail",
    command,
    exitCode: result.code,
    summary,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function resolveVerifier(
  cwd: string,
  state: LoopState,
): Promise<VerificationCommandResolution> {
  if (state.verifyCommand?.trim()) {
    return {
      kind: "command",
      command: state.verifyCommand.trim(),
      source: "session",
    };
  }

  if (!state.autoVerify) {
    return {
      kind: "unavailable",
      summary:
        "Loop auto verification is disabled and no verification command was provided.",
    };
  }

  return detectCodeVerifier(cwd);
}

async function executeLoopRun(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  state: LoopState,
  task: string,
): Promise<void> {
  const verifier = await resolveVerifier(ctx.cwd, state);
  const rounds: VerificationResult[] = [];
  appendRuntimeEvent({
    type: "loop.run_started",
    summary: `${task} | mode=manual`,
  });

  const runTurn = async (message: string) => {
    pi.sendUserMessage(message);
    await ctx.waitForIdle();
  };

  clearLoopTerminalStatus(ctx.sessionManager);
  await runTurn(buildLoopContract(task));

  for (let round = 1; round <= state.maxRounds; round++) {
    setActiveLoopPhase(ctx.sessionManager, "verify", round);
    refreshLoopStatus(ctx, state);
    const verification =
      verifier.kind === "command"
        ? await runVerification(pi, ctx, verifier.command)
        : {
            kind: verifier.kind,
            summary: verifier.summary,
          };
    appendRuntimeEvent({
      type: "loop.verify",
      level: verification.kind === "fail" ? "warn" : "info",
      summary: `${verification.kind}${verification.command ? ` | ${verification.command}` : ""} | ${verification.summary}`,
    });
    rounds.push(verification);

    if (verification.kind === "pass") {
      const outcome = buildSuccessSummary(rounds);
      persistLoopResult(pi, createLoopResultRecord({
        status: "succeeded",
        task,
        rounds: rounds.length,
        verification,
        outcome,
      }));
      setLoopTerminalStatus(ctx.sessionManager, "loop done");
      refreshLoopStatus(ctx, state);
      appendRuntimeEvent({
        type: "loop.result",
        summary: `succeeded | ${task} | rounds=${rounds.length}`,
      });
      emitLoopMessage(pi, buildSuccessSummary(rounds).split("\n"));
      return;
    }

    if (verification.kind === "fail" && round < state.maxRounds) {
      setActiveLoopPhase(ctx.sessionManager, "repair", round + 1);
      refreshLoopStatus(ctx, state);
      await runTurn(buildRepairPrompt(verification, round + 1));
      continue;
    }

    const status: LoopExecutionStatus =
      state.failureMode === "fail" ? "failed" : "handoff";
    const outcome = buildFailureSummary({
      task,
      status,
      rounds,
      lastResult: verification,
    });
    persistLoopResult(pi, createLoopResultRecord({
      status,
      task,
      rounds: rounds.length,
      verification,
      outcome,
    }));
    setLoopTerminalStatus(
      ctx.sessionManager,
      status === "failed" ? "loop failed" : "loop handoff",
    );
    refreshLoopStatus(ctx, state);
    appendRuntimeEvent({
      type: "loop.result",
      level: status === "failed" ? "error" : "warn",
      summary: `${status} | ${task} | rounds=${rounds.length}`,
    });
    emitLoopMessage(
      pi,
      outcome.split("\n"),
    );
    return;
  }
}

async function startAutoLoopIfNeeded(
  ctx: {
    cwd: string;
    sessionManager: ReadonlySessionManager;
  },
  prompt: string,
): Promise<void> {
  const sessionId = ctx.sessionManager.getSessionId();
  if (!sessionId || activeLoops.has(sessionId)) {
    return;
  }

  const task = prompt.trim();
  if (!task) {
    return;
  }

  const state = readPersistedState(ctx.sessionManager, readDefaultState(process.env));
  if (!state.enabled) {
    return;
  }

  const verifier = await resolveVerifier(ctx.cwd, state);
  clearLoopTerminalStatus(ctx.sessionManager);
  activeLoops.set(sessionId, {
    mode: "auto",
    task,
    phase: "run",
    currentRound: 1,
    rounds: [],
    state,
    verifier,
    announceSuccess: false,
  });
  appendRuntimeEvent({
    type: "loop.run_started",
    summary: `${task} | mode=auto`,
  });
}

async function continueAutoLoop(
  pi: ExtensionAPI,
  ctx: {
    cwd: string;
    sessionManager: ReadonlySessionManager;
  },
): Promise<void> {
  const sessionId = ctx.sessionManager.getSessionId();
  const active = sessionId ? activeLoops.get(sessionId) : undefined;
  if (!sessionId || !active || active.mode !== "auto") {
    return;
  }

  setActiveLoopPhase(ctx.sessionManager, "verify");
  refreshLoopStatus(ctx);
  const verification =
    active.verifier.kind === "command"
      ? await runVerification(pi, ctx, active.verifier.command)
      : {
          kind: active.verifier.kind,
          summary: active.verifier.summary,
        };
  appendRuntimeEvent({
    type: "loop.verify",
    level: verification.kind === "fail" ? "warn" : "info",
    summary: `${verification.kind}${verification.command ? ` | ${verification.command}` : ""} | ${verification.summary}`,
  });
  active.rounds.push(verification);

  if (verification.kind === "pass") {
    activeLoops.delete(sessionId);
    const outcome = buildSuccessSummary(active.rounds);
    persistLoopResult(pi, createLoopResultRecord({
      status: "succeeded",
      task: active.task,
      rounds: active.rounds.length,
      verification,
      outcome,
    }));
    setLoopTerminalStatus(ctx.sessionManager, "loop done");
    appendRuntimeEvent({
      type: "loop.result",
      summary: `succeeded | ${active.task} | rounds=${active.rounds.length}`,
    });
    if (active.announceSuccess) {
      emitLoopMessage(pi, outcome.split("\n"));
    }
    return;
  }

  if (
    verification.kind === "fail" &&
    active.rounds.length < active.state.maxRounds
  ) {
    active.announceSuccess = true;
    setActiveLoopPhase(ctx.sessionManager, "repair", active.rounds.length + 1);
    refreshLoopStatus(ctx);
    pi.sendUserMessage(
      buildRepairPrompt(verification, active.rounds.length + 1),
    );
    return;
  }

  activeLoops.delete(sessionId);
  const status: LoopExecutionStatus =
    active.state.failureMode === "fail" ? "failed" : "handoff";
  const outcome = buildFailureSummary({
    task: active.task,
    status,
    rounds: active.rounds,
    lastResult: verification,
  });
  persistLoopResult(pi, createLoopResultRecord({
    status,
    task: active.task,
    rounds: active.rounds.length,
    verification,
    outcome,
  }));
  setLoopTerminalStatus(
    ctx.sessionManager,
    status === "failed" ? "loop failed" : "loop handoff",
  );
  appendRuntimeEvent({
    type: "loop.result",
    level: status === "failed" ? "error" : "warn",
    summary: `${status} | ${active.task} | rounds=${active.rounds.length}`,
  });
  emitLoopMessage(
    pi,
    outcome.split("\n"),
  );
}

function usage(): string {
  return "Usage: /loop <on|off|status|history [n]|show <index>|verify <cmd>|clear-verify|run <task>>";
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    if (ctx.hasUI) {
      await startAutoLoopIfNeeded(ctx, event.prompt);
      const active = getActiveLoop(ctx.sessionManager);
      if (active?.mode === "auto") {
        clearLoopTerminalStatus(ctx.sessionManager);
        setActiveLoopPhase(ctx.sessionManager, "run");
      }
    }
    refreshLoopStatus(ctx);
  });

  pi.on("agent_end", async (_event, ctx) => {
    await continueAutoLoop(pi, ctx);
    refreshLoopStatus(ctx);
  });

  pi.registerCommand("loop", {
    description:
      "Manage glm's explicit delivery-quality loop for the current session.",
    handler: async (args, ctx) => {
      const [subcommand, ...rest] = args.trim().split(/\s+/).filter(Boolean);
      const defaults = readDefaultState(process.env);
      const state = readPersistedState(ctx.sessionManager, defaults);
      const active = getActiveLoop(ctx.sessionManager);
      const lastResult = readPersistedResult(ctx.sessionManager);

      if (!subcommand || subcommand === "status") {
        emitLoopMessage(pi, buildStatusLines(state, active, lastResult));
        return;
      }

      if (subcommand === "on") {
        const next = { ...state, enabled: true };
        persistLoopState(pi, next);
        clearLoopTerminalStatus(ctx.sessionManager);
        refreshLoopStatus(ctx, next);
        emitLoopMessage(pi, buildStatusLines(next, active, lastResult));
        return;
      }

      if (subcommand === "off") {
        const next = { ...state, enabled: false };
        persistLoopState(pi, next);
        clearLoopTerminalStatus(ctx.sessionManager);
        refreshLoopStatus(ctx, next);
        emitLoopMessage(pi, buildStatusLines(next, active, lastResult));
        return;
      }

      if (subcommand === "verify") {
        const command = rest.join(" ").trim();
        if (!command) {
          emitLoopMessage(pi, [usage()]);
          return;
        }

        const next = { ...state, verifyCommand: command };
        persistLoopState(pi, next);
        clearLoopTerminalStatus(ctx.sessionManager);
        refreshLoopStatus(ctx, next);
        emitLoopMessage(pi, buildStatusLines(next, active, lastResult));
        return;
      }

      if (subcommand === "clear-verify") {
        const next = { ...state };
        delete next.verifyCommand;
        persistLoopState(pi, next);
        clearLoopTerminalStatus(ctx.sessionManager);
        refreshLoopStatus(ctx, next);
        emitLoopMessage(pi, buildStatusLines(next, active, lastResult));
        return;
      }

      if (subcommand === "history") {
        const requested = rest[0] ? Number(rest[0]) : 5;
        const limit =
          Number.isInteger(requested) && requested > 0
            ? requested
            : 5;
        emitLoopMessage(
          pi,
          buildHistoryLines(readPersistedResults(ctx.sessionManager), limit),
        );
        return;
      }

      if (subcommand === "show") {
        const requested = rest[0] ? Number(rest[0]) : NaN;
        const index =
          Number.isInteger(requested) && requested > 0
            ? requested
            : NaN;
        if (!Number.isInteger(index)) {
          emitLoopMessage(pi, [usage()]);
          return;
        }

        emitLoopMessage(
          pi,
          buildShowLines(readPersistedResults(ctx.sessionManager), index),
        );
        return;
      }

      if (subcommand === "run") {
        const task = rest.join(" ").trim();
        if (!task) {
          emitLoopMessage(pi, [usage()]);
          return;
        }

        if (!ctx.isIdle()) {
          ctx.ui.notify("Agent is busy. Wait for the current turn to finish.", "warning");
          return;
        }

        const sessionId = ctx.sessionManager.getSessionId();
        if (activeLoops.get(sessionId)?.mode === "auto") {
          ctx.ui.notify("Loop automation is already active for this session.", "warning");
          return;
        }

        clearLoopTerminalStatus(ctx.sessionManager);
        activeLoops.set(sessionId, {
          mode: "manual",
          task,
          phase: "run",
          currentRound: 1,
          maxRounds: state.maxRounds,
        });
        refreshLoopStatus(ctx, state);
        try {
          await executeLoopRun(pi, ctx, state, task);
        } finally {
          activeLoops.delete(sessionId);
          refreshLoopStatus(ctx, state);
        }
        return;
      }

      emitLoopMessage(pi, [usage()]);
    },
  });
}
