import { runChatCommand } from "./commands/chat.js";
import { runRunCommand } from "./commands/run.js";
import { runDoctorCommand, DoctorCommandArgs } from "./commands/doctor.js";
import { authLogin, authLogout, authStatus } from "./commands/auth.js";
import { configGet, configSet } from "./commands/config.js";
import type { ProviderName } from "./providers/types.js";
import { normalizeProviderName } from "./providers/types.js";
import type { ChatCommandInput } from "./commands/chat.js";
import type { RunCommandInput } from "./commands/run.js";

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
  | { command: "auth"; subcommand: "login" | "status" | "logout"; cwd: string }
  | { command: "config"; subcommand: "get"; key: string; cwd: string }
  | { command: "config"; subcommand: "set"; key: string; value: string; cwd: string };

export type CliHandlers = {
  chat: (input: ChatCommandInput & { yolo: boolean }) => Promise<number>;
  run: (input: RunCommandInput & { yolo: boolean }) => Promise<number>;
  doctor: (input: DoctorCommandArgs) => Promise<number>;
  authLogin: () => Promise<number>;
  authStatus: () => Promise<number>;
  authLogout: () => Promise<number>;
  configGet: (key: string) => Promise<number>;
  configSet: (key: string, value: string) => Promise<number>;
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

  if (!command) {
    return { command: "chat", cwd, ...flags };
  }

  if (command === "chat") {
    const pathArg = args.shift();
    if (args.length > 0) {
      throw new Error("The chat command accepts at most one positional path");
    }
    return { command: "chat", cwd: pathArg ?? cwd, ...flags };
  }

  if (command === "run") {
    const task = args.shift()?.trim();
    if (!task) {
      throw new Error("The run command requires a task description");
    }
    const pathArg = args.shift();
    if (args.length > 0) {
      throw new Error('The run command accepts at most one positional path: glm run "<task>" [path]');
    }
    return { command: "run", task, cwd: pathArg ?? cwd, ...flags };
  }

  if (command === "doctor") {
    if (args.length > 0) {
      throw new Error("The doctor command does not accept positional arguments");
    }
    return { command: "doctor", cwd, ...flags };
  }

  if (command === "auth") {
    const subcommand = args.shift();
    if (subcommand === "login" || subcommand === "status" || subcommand === "logout") {
      if (args.length > 0) {
        throw new Error(`The auth ${subcommand} command does not accept positional arguments`);
      }
      return { command: "auth", subcommand, cwd };
    }
    throw new Error(`Unknown auth subcommand: ${subcommand}`);
  }

  if (command === "config") {
    const subcommand = args.shift();

    if (subcommand === "get") {
      const key = args.shift();
      if (!key || args.length > 0) {
        throw new Error("Usage: glm config get <key>");
      }
      return { command: "config", subcommand: "get", key, cwd };
    }

    if (subcommand === "set") {
      const key = args.shift();
      const value = args.join(" ").trim();
      if (!key || !value) {
        throw new Error("Usage: glm config set <key> <value>");
      }
      return { command: "config", subcommand: "set", key, value, cwd };
    }

    throw new Error(`Unknown config subcommand: ${subcommand}`);
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
  authStatus: async () => {
    await authStatus();
    return 0;
  },
  authLogout: async () => {
    await authLogout();
    return 0;
  },
  configGet: async (key) => {
    await configGet(key);
    return 0;
  },
  configSet: async (key, value) => {
    await configSet(key, value);
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
      if (parsed.subcommand === "login") {
        return mergedHandlers.authLogin();
      }
      if (parsed.subcommand === "status") {
        return mergedHandlers.authStatus();
      }
      return mergedHandlers.authLogout();
    case "config":
      if (parsed.subcommand === "get") {
        return mergedHandlers.configGet(parsed.key);
      }
      return mergedHandlers.configSet(parsed.key, parsed.value);
    default:
      throw new Error("Unhandled command");
  }
}
