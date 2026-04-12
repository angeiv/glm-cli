import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export function isDangerousCommand(command: string): boolean {
  return /\brm\s+-rf\b|\bmkfs\b|\bdd\b/.test(command);
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
