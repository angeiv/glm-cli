import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("exit", {
    description: "Exit glm. Alias for /quit.",
    handler: async (_args, ctx) => {
      ctx.shutdown();
    },
  });
}
