import { createInterface } from "node:readline";
import { normalizeProviderName, ProviderName } from "../providers/types.js";
import { readConfigFile, writeConfigFile, StorageProviderKey } from "../app/config-store.js";

type ProviderOptions = Exclude<ProviderName, "anthropic">;
const DEFAULT_PROVIDER: ProviderOptions = "glm-official";

type PromptFn = (question: string) => Promise<string>;
type AuthDependencies = {
  prompt: PromptFn;
  readConfigFile: typeof readConfigFile;
  writeConfigFile: typeof writeConfigFile;
  log: (message: string) => void;
};

function toStorageKey(provider: ProviderOptions): StorageProviderKey {
  return provider === "glm-official" ? "glmOfficial" : "openAICompatible";
}

function createPromptSession(): { prompt: PromptFn; close: () => void } {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    prompt(question) {
      return new Promise((resolve) => {
        rl.question(question, (answer) => {
          resolve(answer);
        });
      });
    },
    close() {
      rl.close();
    },
  };
}

async function runAuthLogin(deps: AuthDependencies): Promise<void> {
  const providerValue = await deps.prompt(`Provider (${DEFAULT_PROVIDER}/openai-compatible) [${DEFAULT_PROVIDER}]: `);
  const selected = normalizeProviderName(providerValue?.trim() || DEFAULT_PROVIDER);
  if (!selected || selected === "anthropic") {
    throw new Error("Only glm-official and openai-compatible providers are supported for auth login.");
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
