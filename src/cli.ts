import { runChatCommand } from "./commands/chat.js";
import { runRunCommand } from "./commands/run.js";
import { runDoctorCommand, DoctorCommandArgs } from "./commands/doctor.js";
import { authLogin } from "./commands/auth.js";
import type { ProviderName } from "./providers/types.js";
import { normalizeProviderName } from "./providers/types.js";
import type { ChatCommandInput } from "./commands/chat.js";
import type { RunCommandInput } from "./commands/run.js";
import type { RuntimeCliFlags } from "./app/env.js";

type GlobalFlags = {
  provider?: ProviderName;
  model?: string;
  cwd?: string;
  yolo: boolean;
};

type BaseCliArgs = {
  cwd: string;
  provider?: ProviderName;
  model?: string;
  yolo: boolean;
};

export type ParsedCliArgs =
  | (BaseCliArgs & { command: "chat" })
  | (BaseCliArgs & { command: "run"; task: string })
  | (BaseCliArgs & { command: "doctor" })
  | { command: "auth"; subcommand: "login"; cwd: string };

export type CliHandlers = {
  chat: (input: ChatCommandInput & { yolo: boolean }) => Promise<number>;
  run: (input: RunCommandInput & { yolo: boolean }) => Promise<number>;
  doctor: (input: DoctorCommandArgs) => Promise<number>;
  authLogin: () => Promise<number>;
};

function extractFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  if (index === args.length - 1) {
    throw new Error(`Missing value for ${flag}`);
  }
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

function extractFlagPresence(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const args = [...argv];
  const flags: GlobalFlags = { yolo: false };

  const providerFlag = extractFlagValue(args, "--provider");
  if (providerFlag) {
    const normalized = normalizeProviderName(providerFlag);
    if (!normalized) {
      throw new Error(`Unknown provider: ${providerFlag}`);
    }
    flags.provider = normalized;
  }

  const modelFlag = extractFlagValue(args, "--model");
  if (modelFlag) {
    flags.model = modelFlag;
  }

  const cwdFlag = extractFlagValue(args, "--cwd");
  if (cwdFlag) {
    flags.cwd = cwdFlag;
  }

  if (extractFlagPresence(args, "--yolo")) {
    flags.yolo = true;
  }

  const command = args.shift();
  const cwd = flags.cwd ?? process.cwd();

  if (!command || command === "chat") {
    return { command: "chat", cwd, ...flags };
  }

  if (command === "run") {
    const task = args.join(" ").trim();
    if (!task) {
      throw new Error("The run command requires a task description");
    }
    return { command: "run", task, cwd, ...flags };
  }

  if (command === "doctor") {
    return { command: "doctor", cwd, ...flags };
  }

  if (command === "auth") {
    const subcommand = args.shift();
    if (subcommand === "login") {
      return { command: "auth", subcommand, cwd };
    }
    throw new Error(`Unknown auth subcommand: ${subcommand}`);
  }

  throw new Error(`Unknown command: ${command}`);
}

const defaultHandlers: CliHandlers = {
  chat: async (input) => {
    await runChatCommand(input);
    return 0;
  },
  run: async (input) => runRunCommand(input),
  doctor: async (input) => runDoctorCommand(input),
  authLogin: async () => {
    await authLogin();
    return 0;
  },
};

export async function runCli(argv: string[], handlers?: Partial<CliHandlers>): Promise<number> {
  const parsed = parseCliArgs(argv);
  const mergedHandlers = { ...defaultHandlers, ...handlers };

  switch (parsed.command) {
    case "chat":
      return mergedHandlers.chat({
        cwd: parsed.cwd,
        provider: parsed.provider,
        model: parsed.model,
        yolo: parsed.yolo,
      });
    case "run":
      return mergedHandlers.run({
        cwd: parsed.cwd,
        task: parsed.task,
        provider: parsed.provider,
        model: parsed.model,
        yolo: parsed.yolo,
      });
    case "doctor":
      return mergedHandlers.doctor({
        cwd: parsed.cwd,
        cli: { provider: parsed.provider, model: parsed.model, yolo: parsed.yolo },
      });
    case "auth":
      return mergedHandlers.authLogin();
    default:
      throw new Error("Unhandled command");
  }
}
