import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const COMMAND_SEPARATORS = new Set([";", "&&", "||", "|"]);
type ApprovalPolicy = "ask" | "auto" | "never";
const GLM_APPROVAL_POLICY_STATE = Symbol.for("glm.approvalPolicy");
type GlmApprovalPolicyState = { policy: ApprovalPolicy };

function getGlmApprovalPolicyState(): GlmApprovalPolicyState {
  const existing = (globalThis as any)[GLM_APPROVAL_POLICY_STATE] as unknown;
  if (typeof existing === "object" && existing !== null) {
    const maybe = existing as Partial<GlmApprovalPolicyState>;
    if (maybe.policy === "ask" || maybe.policy === "auto" || maybe.policy === "never") {
      return maybe as GlmApprovalPolicyState;
    }
  }

  const state: GlmApprovalPolicyState = { policy: "ask" };
  (globalThis as any)[GLM_APPROVAL_POLICY_STATE] = state;
  return state;
}

function normalizeApprovalPolicy(value?: string): ApprovalPolicy | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "ask" || normalized === "auto" || normalized === "never") {
    return normalized;
  }
  return undefined;
}

function getCurrentApprovalPolicy(): ApprovalPolicy {
  // Source of truth: global state shared with the glm CLI runtime.
  // Env var remains supported as a fallback, but we prefer state so `/approval`
  // changes persist even when callers temporarily scope GLM_APPROVAL_POLICY.
  return getGlmApprovalPolicyState().policy ?? normalizeApprovalPolicy(process.env.GLM_APPROVAL_POLICY) ?? "ask";
}

function setCurrentApprovalPolicy(policy: ApprovalPolicy): void {
  getGlmApprovalPolicyState().policy = policy;
  process.env.GLM_APPROVAL_POLICY = policy;
}

function formatApprovalPolicyHelp(current: ApprovalPolicy): string {
  return `Current approvalPolicy: ${current}. Usage: /approval <ask|auto|never>`;
}

const DANGEROUS_BINARIES = new Set([
  // File deletion.
  "rm",
  "rmdir",
  "unlink",
  // Disk/device.
  "mkfs",
  "dd",
  "wipefs",
  "fdisk",
  "parted",
]);
const SHELL_BINARIES = new Set(["bash", "sh", "zsh", "dash", "ksh", "fish"]);

function baseCommand(token: string): string {
  const withoutEscape = token.replace(/^\\+/, "");
  const basename = withoutEscape.split("/").pop() ?? withoutEscape;
  return basename;
}

function isEnvAssignment(token: string): boolean {
  // Very small heuristic: only treat leading NAME=VALUE as assignments.
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

function tokenizeShellLike(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "single" | "double" | null = null;
  let escaped = false;

  function pushCurrent() {
    if (current.length === 0) return;
    tokens.push(current);
    current = "";
  }

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (quote === "single") {
      if (ch === "'") {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (quote === "double") {
      if (ch === '"') {
        quote = null;
        continue;
      }

      if (ch === "\\") {
        const next = command[i + 1];
        // Within double-quotes, backslash can escape a small set of characters.
        if (next === '"' || next === "\\" || next === "`" || next === "$" || next === "\n") {
          escaped = true;
          continue;
        }
      }

      current += ch;
      continue;
    }

    // Not in quotes.
    if (ch === "\\") {
      const next = command[i + 1];
      // Preserve the backslash for characters that would otherwise be treated as
      // shell separators (e.g. find's `\\;` terminator).
      if (next === ";" || next === "|" || next === "&" || next === "\n") {
        current += "\\";
      }
      escaped = true;
      continue;
    }

    if (ch === "'") {
      quote = "single";
      continue;
    }

    if (ch === '"') {
      quote = "double";
      continue;
    }

    // Command separators.
    if (ch === "&" && command[i + 1] === "&") {
      pushCurrent();
      tokens.push("&&");
      i++;
      continue;
    }
    if (ch === "|" && command[i + 1] === "|") {
      pushCurrent();
      tokens.push("||");
      i++;
      continue;
    }
    if (ch === ";" || ch === "|" || ch === "\n") {
      pushCurrent();
      tokens.push(ch);
      continue;
    }

    if (/\s/.test(ch)) {
      pushCurrent();
      continue;
    }

    current += ch;
  }

  pushCurrent();
  return tokens;
}

type ResolvedCommand = {
  command: string;
  commandIndex: number;
};

function resolveInvokedCommand(tokens: string[]): ResolvedCommand | undefined {
  let i = 0;

  while (i < tokens.length && isEnvAssignment(tokens[i])) {
    i++;
  }
  if (i >= tokens.length) return undefined;

  let cmd = baseCommand(tokens[i]);

  const resolveAfterOptions = (optionsThatTakeValue: Set<string>) => {
    i++;
    while (i < tokens.length) {
      const tok = tokens[i];
      if (tok === "--") {
        i++;
        break;
      }
      if (!tok.startsWith("-")) break;
      i++;
      if (optionsThatTakeValue.has(tok) && i < tokens.length) {
        i++;
      }
    }
  };

  if (cmd === "sudo") {
    resolveAfterOptions(new Set(["-u", "-g", "-h", "-p", "-C", "-T", "-t"]));
    while (i < tokens.length && isEnvAssignment(tokens[i])) i++;
    if (i >= tokens.length) return undefined;
    cmd = baseCommand(tokens[i]);
    return { command: cmd, commandIndex: i };
  }

  if (cmd === "env") {
    resolveAfterOptions(new Set(["-u"]));
    while (i < tokens.length && isEnvAssignment(tokens[i])) i++;
    if (i >= tokens.length) return undefined;
    cmd = baseCommand(tokens[i]);
    return { command: cmd, commandIndex: i };
  }

  if (cmd === "command") {
    resolveAfterOptions(new Set());
    if (i >= tokens.length) return undefined;
    cmd = baseCommand(tokens[i]);
    return { command: cmd, commandIndex: i };
  }

  return { command: cmd, commandIndex: i };
}

function findShellScriptArgument(tokens: string[], startIndex: number): string | undefined {
  for (let i = startIndex; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === "-c" || tok === "--command") {
      return tokens[i + 1];
    }

    // Combined flags like "-lc" imply "-c".
    if (tok.startsWith("-") && !tok.startsWith("--") && tok.includes("c")) {
      return tokens[i + 1];
    }
  }

  return undefined;
}

function includesFlag(tokens: string[], flag: string): boolean {
  for (const token of tokens) {
    if (token === flag) return true;
    if (token.startsWith("--")) continue;
    if (token.startsWith("-") && token.includes(flag.replace(/^-+/, ""))) {
      // Handles combined flags like -fdx (flag passed as "-f").
      return true;
    }
  }
  return false;
}

function isDangerousGitSubcommand(tokens: string[], commandIndex: number): boolean {
  const sub = tokens[commandIndex + 1];
  if (!sub) return false;

  if (sub === "reset") {
    return tokens.includes("--hard");
  }

  if (sub === "clean") {
    // git clean is a no-op unless forced.
    return includesFlag(tokens.slice(commandIndex + 2), "-f") || tokens.includes("--force");
  }

  return false;
}

function hasFindExecDangerousCommand(tokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== "-exec" && tokens[i] !== "-execdir") continue;
    const start = i + 1;
    if (start >= tokens.length) continue;
    const execTokens: string[] = [];
    for (let j = start; j < tokens.length; j++) {
      const tok = tokens[j];
      if (tok === ";" || tok === "\\;" || tok === "+" || tok === "\\+") break;
      execTokens.push(tok);
    }
    if (execTokens.length === 0) continue;
    if (isDangerousTokenSequence(execTokens)) return true;
  }
  return false;
}

function isDangerousXargsCommand(tokens: string[], commandIndex: number): boolean {
  // xargs [opts] [command [initial-args]]
  let i = commandIndex + 1;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok === "--") {
      i++;
      break;
    }
    if (!tok.startsWith("-")) break;
    // Skip option arg for a small subset that commonly takes values.
    if (tok === "-I" || tok === "-n" || tok === "-L" || tok === "-P" || tok === "-s" || tok === "-E") {
      i += 2;
      continue;
    }
    i++;
  }

  const sub = tokens[i];
  if (!sub) return false;
  return isDangerousTokenSequence(tokens.slice(i));
}

function isDangerousTokenSequence(tokens: string[]): boolean {
  if (tokens.length === 0) return false;

  const resolved = resolveInvokedCommand(tokens);
  if (!resolved) return false;

  const { command, commandIndex } = resolved;

  if (DANGEROUS_BINARIES.has(command)) {
    return true;
  }

  if (command === "git") {
    return isDangerousGitSubcommand(tokens, commandIndex);
  }

  if (SHELL_BINARIES.has(command)) {
    const script = findShellScriptArgument(tokens, commandIndex + 1);
    if (script && isDangerousCommand(script)) {
      return true;
    }
  }

  if (command === "find" && hasFindExecDangerousCommand(tokens)) {
    return true;
  }

  if (command === "xargs" && isDangerousXargsCommand(tokens, commandIndex)) {
    return true;
  }

  return false;
}

export function isDangerousCommand(command: string): boolean {
  const normalized = command.trim();
  if (!normalized) return false;

  const tokens = tokenizeShellLike(normalized);
  let segment: string[] = [];

  const flushSegment = () => {
    if (segment.length === 0) return false;
    const isDangerous = isDangerousTokenSequence(segment);
    segment = [];
    return isDangerous;
  };

  for (const token of tokens) {
    if (COMMAND_SEPARATORS.has(token)) {
      if (flushSegment()) return true;
      continue;
    }
    segment.push(token);
  }

  return flushSegment();
}

export default function (pi: ExtensionAPI) {
  const updateApprovalStatus = (policy: ApprovalPolicy, ctx: { ui: { setStatus: (key: string, text: string | undefined) => void } }) => {
    try {
      ctx.ui.setStatus("glm.approvalPolicy", `approval: ${policy}`);
    } catch {
      // Ignore status update failures in non-interactive modes.
    }
  };

  const registerApprovalCommand = (name: string) => {
    pi.registerCommand(name, {
      description: "Set approval policy (ask|auto|never) for bash tool confirmations",
      handler: async (args, ctx) => {
        const trimmed = args.trim();
        const current = getCurrentApprovalPolicy();

        if (!trimmed) {
          ctx.ui.notify(formatApprovalPolicyHelp(current), "info");
          updateApprovalStatus(current, ctx);
          return;
        }

        const next = normalizeApprovalPolicy(trimmed.split(/\s+/)[0]);
        if (!next) {
          ctx.ui.notify(formatApprovalPolicyHelp(current), "error");
          updateApprovalStatus(current, ctx);
          return;
        }

        setCurrentApprovalPolicy(next);
        updateApprovalStatus(next, ctx);
        ctx.ui.notify(`approvalPolicy set to ${next}`, "info");
      },
    });
  };

  pi.on("session_start", (_event, ctx) => {
    const current = getCurrentApprovalPolicy();
    updateApprovalStatus(current, ctx);
  });

  registerApprovalCommand("approval");
  registerApprovalCommand("policy");

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const command = String(event.input.command ?? "").trim();
    if (!command) return;

    if (isDangerousCommand(command)) {
      let ok = false;
      try {
        ok = await ctx.ui.confirm(
          "Dangerous command requires explicit approval",
          command,
        );
      } catch {
        ok = false;
      }

      if (!ok) {
        return { block: true, reason: "Denied dangerous command" };
      }

      return;
    }

    const policy = getCurrentApprovalPolicy();
    if (policy === "never") return;
    const sensitive = /\bgit push\b|\bnpm publish\b|\bsudo\b/.test(command);
    if (policy === "auto" && !sensitive) return;

    const ok = await ctx.ui.confirm("Allow command?", command);
    if (!ok) {
      return { block: true, reason: "Denied by glm approval policy" };
    }
  });
}
