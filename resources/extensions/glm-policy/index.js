// resources/extensions/shared/runtime-state.js
var GLM_EVENT_LOG_STATE = /* @__PURE__ */ Symbol.for("glm.eventLog");
function getRuntimeEventLogState() {
  const existing = globalThis[GLM_EVENT_LOG_STATE];
  if (existing && typeof existing === "object" && typeof existing.limit === "number" && typeof existing.nextId === "number" && Array.isArray(existing.events)) {
    return existing;
  }
  const state = {
    limit: 200,
    nextId: 1,
    events: []
  };
  globalThis[GLM_EVENT_LOG_STATE] = state;
  return state;
}
function appendRuntimeEvent({
  type,
  summary,
  level = "info",
  details
}) {
  const state = getRuntimeEventLogState();
  const event = {
    id: state.nextId++,
    at: (/* @__PURE__ */ new Date()).toISOString(),
    type,
    summary,
    level,
    ...details ? { details } : {}
  };
  state.events.push(event);
  if (state.events.length > state.limit) {
    state.events = state.events.slice(state.events.length - state.limit);
  }
  return event;
}

// resources/extensions/glm-policy/index.ts
var COMMAND_SEPARATORS = /* @__PURE__ */ new Set([";", "&&", "||", "|"]);
var GLM_APPROVAL_POLICY_STATE = /* @__PURE__ */ Symbol.for("glm.approvalPolicy");
var APPROVAL_POLICIES = [
  {
    value: "ask",
    label: "ask - confirm every non-dangerous bash command"
  },
  {
    value: "auto",
    label: "auto - allow low-risk commands automatically; still ask for sensitive ones"
  },
  {
    value: "never",
    label: "never - skip non-dangerous approvals; dangerous commands still require approval"
  }
];
function getGlmApprovalPolicyState() {
  const existing = globalThis[GLM_APPROVAL_POLICY_STATE];
  if (typeof existing === "object" && existing !== null) {
    const maybe = existing;
    if (maybe.policy === "ask" || maybe.policy === "auto" || maybe.policy === "never") {
      return maybe;
    }
  }
  const state = { policy: "ask" };
  globalThis[GLM_APPROVAL_POLICY_STATE] = state;
  return state;
}
function normalizeApprovalPolicy(value) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "ask" || normalized === "auto" || normalized === "never") {
    return normalized;
  }
  return void 0;
}
function getCurrentApprovalPolicy() {
  return getGlmApprovalPolicyState().policy ?? normalizeApprovalPolicy(process.env.GLM_APPROVAL_POLICY) ?? "ask";
}
function setCurrentApprovalPolicy(policy) {
  getGlmApprovalPolicyState().policy = policy;
  process.env.GLM_APPROVAL_POLICY = policy;
}
function formatApprovalPolicyHelp(current) {
  return [
    `Current approvalPolicy: ${current}`,
    "Usage: /approval <ask|auto|never>",
    "Modes:",
    ...APPROVAL_POLICIES.map((policy) => `- ${policy.label}`)
  ].join("\n");
}
function getApprovalPolicyCompletions(prefix) {
  const normalized = prefix.trim().toLowerCase();
  const filtered = APPROVAL_POLICIES.filter((policy) => policy.value.startsWith(normalized));
  return filtered.length > 0 ? filtered.map((policy) => ({ value: policy.value, label: policy.label })) : null;
}
function getApprovalPolicyNotification(policy) {
  if (policy === "auto") {
    return {
      message: "approvalPolicy set to auto. Low-risk bash commands will run without confirmation; sensitive and dangerous commands still require approval.",
      level: "warning"
    };
  }
  if (policy === "never") {
    return {
      message: "approvalPolicy set to never. Non-dangerous bash commands will run without confirmation; dangerous commands still require explicit approval.",
      level: "warning"
    };
  }
  return {
    message: "approvalPolicy set to ask. Non-dangerous bash commands now require confirmation again.",
    level: "info"
  };
}
var DANGEROUS_BINARIES = /* @__PURE__ */ new Set([
  // File deletion.
  "rm",
  "rmdir",
  "unlink",
  // Disk/device.
  "mkfs",
  "dd",
  "wipefs",
  "fdisk",
  "parted"
]);
var SHELL_BINARIES = /* @__PURE__ */ new Set(["bash", "sh", "zsh", "dash", "ksh", "fish"]);
function baseCommand(token) {
  const withoutEscape = token.replace(/^\\+/, "");
  const basename = withoutEscape.split("/").pop() ?? withoutEscape;
  return basename;
}
function isEnvAssignment(token) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}
function tokenizeShellLike(command) {
  const tokens = [];
  let current = "";
  let quote = null;
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
        if (next === '"' || next === "\\" || next === "`" || next === "$" || next === "\n") {
          escaped = true;
          continue;
        }
      }
      current += ch;
      continue;
    }
    if (ch === "\\") {
      const next = command[i + 1];
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
function resolveInvokedCommand(tokens) {
  let i = 0;
  while (i < tokens.length && isEnvAssignment(tokens[i])) {
    i++;
  }
  if (i >= tokens.length) return void 0;
  let cmd = baseCommand(tokens[i]);
  const resolveAfterOptions = (optionsThatTakeValue) => {
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
    resolveAfterOptions(/* @__PURE__ */ new Set(["-u", "-g", "-h", "-p", "-C", "-T", "-t"]));
    while (i < tokens.length && isEnvAssignment(tokens[i])) i++;
    if (i >= tokens.length) return void 0;
    cmd = baseCommand(tokens[i]);
    return { command: cmd, commandIndex: i };
  }
  if (cmd === "env") {
    resolveAfterOptions(/* @__PURE__ */ new Set(["-u"]));
    while (i < tokens.length && isEnvAssignment(tokens[i])) i++;
    if (i >= tokens.length) return void 0;
    cmd = baseCommand(tokens[i]);
    return { command: cmd, commandIndex: i };
  }
  if (cmd === "command") {
    resolveAfterOptions(/* @__PURE__ */ new Set());
    if (i >= tokens.length) return void 0;
    cmd = baseCommand(tokens[i]);
    return { command: cmd, commandIndex: i };
  }
  return { command: cmd, commandIndex: i };
}
function findShellScriptArgument(tokens, startIndex) {
  for (let i = startIndex; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === "-c" || tok === "--command") {
      return tokens[i + 1];
    }
    if (tok.startsWith("-") && !tok.startsWith("--") && tok.includes("c")) {
      return tokens[i + 1];
    }
  }
  return void 0;
}
function includesFlag(tokens, flag) {
  for (const token of tokens) {
    if (token === flag) return true;
    if (token.startsWith("--")) continue;
    if (token.startsWith("-") && token.includes(flag.replace(/^-+/, ""))) {
      return true;
    }
  }
  return false;
}
function isDangerousGitSubcommand(tokens, commandIndex) {
  const sub = tokens[commandIndex + 1];
  if (!sub) return false;
  if (sub === "reset") {
    return tokens.includes("--hard");
  }
  if (sub === "clean") {
    return includesFlag(tokens.slice(commandIndex + 2), "-f") || tokens.includes("--force");
  }
  return false;
}
function hasFindExecDangerousCommand(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== "-exec" && tokens[i] !== "-execdir") continue;
    const start = i + 1;
    if (start >= tokens.length) continue;
    const execTokens = [];
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
function isDangerousXargsCommand(tokens, commandIndex) {
  let i = commandIndex + 1;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok === "--") {
      i++;
      break;
    }
    if (!tok.startsWith("-")) break;
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
function isDangerousTokenSequence(tokens) {
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
function isDangerousCommand(command) {
  const normalized = command.trim();
  if (!normalized) return false;
  const tokens = tokenizeShellLike(normalized);
  let segment = [];
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
function index_default(pi) {
  const updateApprovalStatus = (policy, ctx) => {
    try {
      ctx.ui.setStatus("glm.approvalPolicy", `approval: ${policy}`);
    } catch {
    }
  };
  const registerApprovalCommand = (name) => {
    pi.registerCommand(name, {
      description: "Set approval policy (ask|auto|never) for bash tool confirmations",
      getArgumentCompletions: (prefix) => getApprovalPolicyCompletions(prefix),
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
        appendRuntimeEvent({
          type: "approval.changed",
          summary: `approvalPolicy set to ${next}`
        });
        const notification = getApprovalPolicyNotification(next);
        ctx.ui.notify(notification.message, notification.level);
      }
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
      let ok2 = false;
      try {
        ok2 = await ctx.ui.confirm(
          "Dangerous command requires explicit approval",
          command
        );
      } catch {
        ok2 = false;
      }
      if (!ok2) {
        appendRuntimeEvent({
          type: "approval.dangerous_command_denied",
          level: "warn",
          summary: command
        });
        return { block: true, reason: "Denied dangerous command" };
      }
      appendRuntimeEvent({
        type: "approval.dangerous_command_approved",
        summary: command
      });
      return;
    }
    const policy = getCurrentApprovalPolicy();
    if (policy === "never") return;
    const sensitive = /\bgit push\b|\bnpm publish\b|\bsudo\b/.test(command);
    if (policy === "auto" && !sensitive) return;
    const ok = await ctx.ui.confirm("Allow command?", command);
    if (!ok) {
      appendRuntimeEvent({
        type: "approval.command_denied",
        level: "warn",
        summary: command
      });
      return { block: true, reason: "Denied by glm approval policy" };
    }
    appendRuntimeEvent({
      type: "approval.command_approved",
      summary: command
    });
  });
}
export {
  index_default as default,
  isDangerousCommand
};
