import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type Usage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
};

function asUsage(message: unknown): Usage | undefined {
  if (!message || typeof message !== "object") return undefined;
  const maybe = message as Record<string, unknown>;
  const usage = maybe.usage;
  if (!usage || typeof usage !== "object") return undefined;
  const u = usage as Record<string, unknown>;

  const input = typeof u.input === "number" ? u.input : undefined;
  const output = typeof u.output === "number" ? u.output : undefined;
  const cacheRead = typeof u.cacheRead === "number" ? u.cacheRead : undefined;
  const cacheWrite = typeof u.cacheWrite === "number" ? u.cacheWrite : undefined;
  const totalTokens = typeof u.totalTokens === "number" ? u.totalTokens : undefined;
  if (
    input === undefined ||
    output === undefined ||
    cacheRead === undefined ||
    cacheWrite === undefined ||
    totalTokens === undefined
  ) {
    return undefined;
  }

  const costRaw = u.cost;
  const cost =
    costRaw && typeof costRaw === "object"
      ? {
          input: typeof (costRaw as any).input === "number" ? (costRaw as any).input : undefined,
          output: typeof (costRaw as any).output === "number" ? (costRaw as any).output : undefined,
          cacheRead:
            typeof (costRaw as any).cacheRead === "number" ? (costRaw as any).cacheRead : undefined,
          cacheWrite:
            typeof (costRaw as any).cacheWrite === "number"
              ? (costRaw as any).cacheWrite
              : undefined,
          total: typeof (costRaw as any).total === "number" ? (costRaw as any).total : undefined,
        }
      : undefined;

  return { input, output, cacheRead, cacheWrite, totalTokens, cost };
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString();
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value === 0) return "0";
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

type Totals = {
  turns: number;
  usage: Usage;
};

function sumUsage(items: Usage[]): Totals {
  const usage: Usage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };

  for (const item of items) {
    usage.input += item.input;
    usage.output += item.output;
    usage.cacheRead += item.cacheRead;
    usage.cacheWrite += item.cacheWrite;
    usage.totalTokens += item.totalTokens;
    if (item.cost) {
      usage.cost!.input = (usage.cost!.input ?? 0) + (item.cost.input ?? 0);
      usage.cost!.output = (usage.cost!.output ?? 0) + (item.cost.output ?? 0);
      usage.cost!.cacheRead = (usage.cost!.cacheRead ?? 0) + (item.cost.cacheRead ?? 0);
      usage.cost!.cacheWrite = (usage.cost!.cacheWrite ?? 0) + (item.cost.cacheWrite ?? 0);
      usage.cost!.total = (usage.cost!.total ?? 0) + (item.cost.total ?? 0);
    }
  }

  const turns = items.length;
  return { turns, usage };
}

function buildStatsLines(label: string, totals: Totals): string[] {
  const u = totals.usage;
  const tokenParts = [
    `in ${formatNumber(u.input)}`,
    `out ${formatNumber(u.output)}`,
    u.cacheRead ? `cacheR ${formatNumber(u.cacheRead)}` : undefined,
    u.cacheWrite ? `cacheW ${formatNumber(u.cacheWrite)}` : undefined,
    `total ${formatNumber(u.totalTokens)}`,
  ].filter(Boolean) as string[];

  const costTotal = u.cost?.total ?? 0;
  const costParts =
    costTotal > 0
      ? [
          `cost in ${formatMoney(u.cost?.input ?? 0)}`,
          `out ${formatMoney(u.cost?.output ?? 0)}`,
          (u.cost?.cacheRead ?? 0) ? `cacheR ${formatMoney(u.cost?.cacheRead ?? 0)}` : undefined,
          (u.cost?.cacheWrite ?? 0) ? `cacheW ${formatMoney(u.cost?.cacheWrite ?? 0)}` : undefined,
          `total ${formatMoney(costTotal)}`,
        ].filter(Boolean)
      : [];

  return [
    `${label}: ${totals.turns} assistant turn${totals.turns === 1 ? "" : "s"}`,
    `tokens: ${tokenParts.join(" | ")}`,
    ...(costParts.length ? [`cost: ${costParts.join(" | ")}`] : []),
  ];
}

export default function (pi: ExtensionAPI) {
  const key = "glm.stats";

  const register = (name: string) =>
    pi.registerCommand(name, {
      description: "Show token/cost usage stats for the current session.",
      handler: async (args, ctx) => {
        const trimmed = args.trim();
        if (!ctx.hasUI) {
          return;
        }

        if (trimmed === "clear") {
          ctx.ui.setWidget(key, undefined);
          ctx.ui.notify("Cleared stats widget", "info");
          return;
        }

        const allEntries = ctx.sessionManager.getEntries();
        const allAssistantUsages: Usage[] = [];
        for (const entry of allEntries) {
          if (entry.type !== "message") continue;
          const msg = (entry as any).message as { role?: string };
          if (msg?.role !== "assistant") continue;
          const usage = asUsage(msg);
          if (usage) allAssistantUsages.push(usage);
        }

        const leafId = ctx.sessionManager.getLeafId();
        const branchEntries = ctx.sessionManager.getBranch(leafId ?? undefined);
        const branchAssistantUsages: Usage[] = [];
        for (const entry of branchEntries) {
          if (entry.type !== "message") continue;
          const msg = (entry as any).message as { role?: string };
          if (msg?.role !== "assistant") continue;
          const usage = asUsage(msg);
          if (usage) branchAssistantUsages.push(usage);
        }

        const lines: string[] = [];
        lines.push(...buildStatsLines("Session total", sumUsage(allAssistantUsages)));
        lines.push("");
        lines.push(...buildStatsLines("Current branch", sumUsage(branchAssistantUsages)));

        const contextUsage = ctx.getContextUsage();
        if (contextUsage) {
          lines.push("");
          lines.push(
            `context: ${
              contextUsage.tokens === null ? "unknown" : formatNumber(contextUsage.tokens)
            } / ${formatNumber(contextUsage.contextWindow)}${
              contextUsage.percent === null ? "" : ` (${Math.round(contextUsage.percent * 100)}%)`
            }`,
          );
        }

        ctx.ui.setWidget(key, lines, { placement: "belowEditor" });
        ctx.ui.notify("Updated stats widget (use /stats clear to hide)", "info");
      },
    });

  register("stats");
  register("usage");
}
