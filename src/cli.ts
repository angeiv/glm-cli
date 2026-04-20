import { runChatCommand } from "./commands/chat.js";
import { runRunCommand } from "./commands/run.js";
import { runDoctorCommand, DoctorCommandArgs } from "./commands/doctor.js";
import { configGet, configSet } from "./commands/config.js";
import { runInspectCommand, type InspectCommandArgs } from "./commands/inspect.js";
import { runVerifyCommand, type VerifyCommandArgs } from "./commands/verify.js";
import type { LoopFailureMode } from "./app/config-store.js";
import type { ProviderName } from "./providers/types.js";
import { normalizeProviderName } from "./providers/types.js";
import type { ChatCommandInput } from "./commands/chat.js";
import type { RunCommandInput } from "./commands/run.js";
import { VERSION } from "./version.js";

const HELP_TEXT = `
glm - local-repository coding assistant

Usage:
  glm [options]                        Start interactive chat (default)
  glm chat [path] [options]            Start interactive chat in path
  glm run "<task>" [path] [options]    Execute a single task and exit
  glm verify [path] [options]          Run verification (auto-detect by default)
  glm inspect [options]                Show effective runtime state
  glm doctor                           Run diagnostics
  glm config get <key>                 Get config value
  glm config set <key> <value>         Set config value

Options:
  --provider <name>     Provider: glm, openai-compatible, openai-responses, anthropic
  --model <id>          Model ID (e.g., glm-5.1, glm-4-flash)
  --cwd <path>          Working directory
  --yolo                Skip approval prompts (dangerous commands still blocked)
  --loop                Enable the delivery-quality loop
  --verify <command>    Verification command to run after each loop round
  --max-rounds <n>      Maximum loop rounds before stopping
  --fail-mode <mode>    Loop failure mode: handoff or fail
  --json                Print inspect/verify output as JSON
  --help, -h            Show help
  --version, -v         Show version

Examples:
  glm
  glm --provider glm
  glm run "fix the tests"
  glm verify
  glm run "fix the tests" --loop --verify "pnpm test" --max-rounds 4
  glm --yolo run "refactor X"

Version: ${VERSION}
`;

type GlobalFlags = {
  provider?: ProviderName;
  model?: string;
  cwd?: string;
  yolo: boolean;
  loop: boolean;
  verify?: string;
  maxRounds?: number;
  failMode?: LoopFailureMode;
};

type BaseCliArgs = {
  cwd: string;
  provider?: ProviderName;
  model?: string;
  yolo: boolean;
  loop: boolean;
  verify?: string;
  maxRounds?: number;
  failMode?: LoopFailureMode;
};

export type ParsedCliArgs =
  | (BaseCliArgs & { command: "chat" })
  | (BaseCliArgs & { command: "run"; task: string })
  | (BaseCliArgs & { command: "verify"; json: boolean })
  | (BaseCliArgs & { command: "inspect"; json: boolean })
  | (BaseCliArgs & { command: "doctor" })
  | { command: "config"; subcommand: "get"; key: string; cwd: string }
  | { command: "config"; subcommand: "set"; key: string; value: string; cwd: string };

export type CliHandlers = {
  chat: (input: ChatCommandInput & { yolo: boolean }) => Promise<number>;
  run: (input: RunCommandInput & { yolo: boolean }) => Promise<number>;
  verify: (input: VerifyCommandArgs) => Promise<number>;
  doctor: (input: DoctorCommandArgs) => Promise<number>;
  inspect: (input: InspectCommandArgs) => Promise<number>;
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

function normalizeFailMode(value?: string): LoopFailureMode | undefined {
  if (value === "handoff" || value === "fail") {
    return value;
  }
  return undefined;
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const args = [...argv];
  const flags: GlobalFlags = { yolo: false, loop: false };

  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log(`glm v${VERSION}`);
    process.exit(0);
  }

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

  if (extractFlagPresence(args, "--loop")) {
    flags.loop = true;
  }

  const verifyFlag = extractFlagValue(args, "--verify");
  if (verifyFlag) {
    flags.verify = verifyFlag;
  }

  const maxRoundsFlag = extractFlagValue(args, "--max-rounds");
  if (maxRoundsFlag) {
    const parsed = Number(maxRoundsFlag);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error("--max-rounds must be a positive integer");
    }
    flags.maxRounds = parsed;
  }

  const failModeFlag = extractFlagValue(args, "--fail-mode");
  if (failModeFlag) {
    const normalized = normalizeFailMode(failModeFlag);
    if (!normalized) {
      throw new Error(`Unknown fail mode: ${failModeFlag}`);
    }
    flags.failMode = normalized;
  }
  const jsonFlag = extractFlagPresence(args, "--json");

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

  if (command === "verify") {
    const pathArg = args.shift();
    if (args.length > 0) {
      throw new Error("The verify command accepts at most one positional path");
    }
    return {
      command: "verify",
      cwd: pathArg ?? cwd,
      json: jsonFlag,
      ...flags,
    };
  }

  if (command === "inspect") {
    if (args.length > 0) {
      throw new Error("The inspect command does not accept positional arguments");
    }
    return { command: "inspect", cwd, json: jsonFlag, ...flags };
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
  verify: async (input) => runVerifyCommand(input),
  doctor: async (input) => runDoctorCommand(input),
  inspect: async (input) => runInspectCommand(input),
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
        loop: parsed.loop,
        verify: parsed.verify,
        maxRounds: parsed.maxRounds,
        failMode: parsed.failMode,
      });
    case "run":
      return mergedHandlers.run({
        cwd: parsed.cwd,
        task: parsed.task,
        provider: parsed.provider,
        model: parsed.model,
        yolo: parsed.yolo,
        loop: parsed.loop,
        verify: parsed.verify,
        maxRounds: parsed.maxRounds,
        failMode: parsed.failMode,
      });
    case "verify":
      return mergedHandlers.verify({
        cwd: parsed.cwd,
        verify: parsed.verify,
        json: parsed.json,
      });
    case "doctor":
      return mergedHandlers.doctor({
        cwd: parsed.cwd,
        cli: {
          provider: parsed.provider,
          model: parsed.model,
          yolo: parsed.yolo,
          loop: parsed.loop,
          verify: parsed.verify,
          maxRounds: parsed.maxRounds,
          failMode: parsed.failMode,
        },
      });
    case "inspect":
      return mergedHandlers.inspect({
        cwd: parsed.cwd,
        json: parsed.json,
        cli: {
          provider: parsed.provider,
          model: parsed.model,
          yolo: parsed.yolo,
          loop: parsed.loop,
          verify: parsed.verify,
          maxRounds: parsed.maxRounds,
          failMode: parsed.failMode,
        },
      });
    case "config":
      if (parsed.subcommand === "get") {
        return mergedHandlers.configGet(parsed.key);
      }
      return mergedHandlers.configSet(parsed.key, parsed.value);
    default:
      throw new Error("Unhandled command");
  }
}
