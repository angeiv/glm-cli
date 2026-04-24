import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getActiveLoop } from "../glm-loop/index.js";
import { notifyTurnComplete } from "../shared/notify.js";

export default function (pi: ExtensionAPI) {
  pi.on("agent_end", async (_event, ctx) => {
    const sessionId = ctx.sessionManager?.getSessionId?.();
    if (ctx.sessionManager && getActiveLoop(ctx.sessionManager)) {
      return;
    }

    notifyTurnComplete(sessionId);
  });
}
