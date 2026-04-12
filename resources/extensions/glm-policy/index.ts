import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

function hasRecursiveForceRm(command: string): boolean {
  const tokens = command.split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== "rm") continue;
    let hasR = false;
    let hasF = false;
    for (let j = i + 1; j < tokens.length; j++) {
      const token = tokens[j];
      if (!token.startsWith("-")) break;
      const flags = token.replace(/^-+/, "");
      for (const char of flags) {
        if (char === "r") hasR = true;
        if (char === "f") hasF = true;
      }
      if (hasR && hasF) return true;
    }
  }
  return false;
}

export function isDangerousCommand(command: string): boolean {
  const normalized = command.trim();
  if (!normalized) return false;
  if (hasRecursiveForceRm(normalized)) {
    return true;
  }
  return /\bmkfs\b|\bdd\b/.test(normalized);
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const command = String(event.input.command ?? "").trim();
    if (!command) return;

    if (isDangerousCommand(command)) {
      return { block: true, reason: "Blocked by glm safety policy" };
    }

    const policy = (process.env.GLM_APPROVAL_POLICY ?? "ask").toLowerCase();
    if (policy === "never") return;
    const sensitive = /\bgit push\b|\bnpm publish\b|\bsudo\b/.test(command);
    if (policy === "auto" && !sensitive) return;

    const ok = await ctx.ui.confirm("Allow command?", command);
    if (!ok) {
      return { block: true, reason: "Denied by glm approval policy" };
    }
  });
}
