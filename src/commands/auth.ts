import { createInterface } from "node:readline";
import { readConfigFile, type StorageProviderKey, writeConfigFile } from "../app/config-store.js";
import { normalizeProviderName, type ProviderName } from "../providers/types.js";

type ProviderOptions = Extract<ProviderName, "glm" | "openai-compatible">;
const DEFAULT_PROVIDER: ProviderOptions = "glm";

type PromptFn = (question: string) => Promise<string>;

type AuthDependencies = {
  prompt: PromptFn;
  readConfigFile: typeof readConfigFile;
  writeConfigFile: typeof writeConfigFile;
  log: (message: string) => void;
};

type AuthStatusDependencies = {
  readConfigFile: typeof readConfigFile;
  log: (message: string) => void;
  env: NodeJS.ProcessEnv;
};

type AuthLogoutDependencies = {
  readConfigFile: typeof readConfigFile;
  writeConfigFile: typeof writeConfigFile;
  log: (message: string) => void;
};

function toStorageKey(provider: ProviderOptions): StorageProviderKey {
  return provider;
}

function createPromptSession(): { prompt: PromptFn; close: () => void } {
  if (!process.stdin.isTTY) {
    let linesPromise: Promise<string[]> | undefined;
    let index = 0;

    return {
      async prompt(question) {
        process.stdout.write(question);
        if (!linesPromise) {
          linesPromise = (async () => {
            const chunks: Buffer[] = [];
            for await (const chunk of process.stdin) {
              chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
            }

            return Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
          })();
        }

        const lines = await linesPromise;
        const answer = lines[index] ?? "";
        index += 1;
        return answer;
      },
      close() {
        process.stdout.write("\n");
      },
    };
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    prompt(question) {
      return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer));
      });
    },
    close() {
      rl.close();
    },
  };
}

async function runAuthLogin(deps: AuthDependencies): Promise<void> {
  const providerValue = await deps.prompt(
    `Provider (${DEFAULT_PROVIDER}/openai-compatible) [${DEFAULT_PROVIDER}]: `,
  );
  const selected = normalizeProviderName(providerValue?.trim() || DEFAULT_PROVIDER);
  if (!selected || selected === "anthropic" || selected === "openai-responses") {
    throw new Error("Only glm and openai-compatible providers are supported for auth login.");
  }

  const provider = selected as ProviderOptions;
  const apiKey = await deps.prompt("API key: ");
  if (!apiKey.trim()) {
    throw new Error("API key is required.");
  }

  const baseURL = await deps.prompt("Base URL (leave empty to keep default): ");
  const config = await deps.readConfigFile();
  const storageKey = toStorageKey(provider);

  config.providers[storageKey] = {
    ...config.providers[storageKey],
    apiKey: apiKey.trim(),
    baseURL: baseURL.trim() || config.providers[storageKey]?.baseURL || "",
  };

  await deps.writeConfigFile(config);
  deps.log(`Credentials saved for provider ${provider}.`);
}

export async function authLogin(deps?: Partial<AuthDependencies>): Promise<void> {
  const session = deps?.prompt ? null : createPromptSession();

  try {
    await runAuthLogin({
      prompt: deps?.prompt ?? session!.prompt,
      readConfigFile: deps?.readConfigFile ?? readConfigFile,
      writeConfigFile: deps?.writeConfigFile ?? writeConfigFile,
      log: deps?.log ?? console.log,
    });
  } finally {
    session?.close();
  }
}

export async function authStatus(deps?: Partial<AuthStatusDependencies>): Promise<void> {
  const config = await (deps?.readConfigFile ?? readConfigFile)();
  const log = deps?.log ?? console.log;
  const env = deps?.env ?? process.env;

  log(`glm: ${config.providers.glm.apiKey.trim() ? "configured" : "missing"}`);
  log(
    `openai-compatible: ${config.providers["openai-compatible"].apiKey.trim() ? "configured" : "missing"}`,
  );
  log(`anthropic (env): ${env.ANTHROPIC_AUTH_TOKEN?.trim() ? "configured" : "missing"}`);
}

export async function authLogout(deps?: Partial<AuthLogoutDependencies>): Promise<void> {
  const config = await (deps?.readConfigFile ?? readConfigFile)();

  config.providers.glm = {
    ...config.providers.glm,
    apiKey: "",
  };
  config.providers["openai-compatible"] = {
    ...config.providers["openai-compatible"],
    apiKey: "",
  };

  await (deps?.writeConfigFile ?? writeConfigFile)(config);
  (deps?.log ?? console.log)("Stored credentials cleared for glm and openai-compatible.");
}
