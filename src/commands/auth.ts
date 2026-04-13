import { createInterface } from "node:readline";
import { normalizeProviderName, ProviderName } from "../providers/types.js";
import { readConfigFile, writeConfigFile, StorageProviderKey } from "../app/config-store.js";

type ProviderOptions = Exclude<ProviderName, "anthropic">;
const DEFAULT_PROVIDER: ProviderOptions = "glm-official";

function toStorageKey(provider: ProviderOptions): StorageProviderKey {
  return provider === "glm-official" ? "glmOfficial" : "openAICompatible";
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function authLogin(): Promise<void> {
  const providerValue = await prompt(
    `Provider (${DEFAULT_PROVIDER}/openai-compatible) [${DEFAULT_PROVIDER}]: `,
  );
  const selected = normalizeProviderName(providerValue?.trim() || DEFAULT_PROVIDER);
  if (!selected || selected === "anthropic") {
    throw new Error("Only glm-official and openai-compatible providers are supported for auth login.");
  }

  const provider = selected as ProviderOptions;

  const apiKey = await prompt("API key: ");
  if (!apiKey.trim()) {
    throw new Error("API key is required.");
  }

  const baseURL = await prompt("Base URL (leave empty to keep default): ");
  const config = await readConfigFile();
  const storageKey = toStorageKey(provider);
  config.providers[storageKey] = {
    apiKey: apiKey.trim(),
    baseURL: baseURL.trim() || config.providers[storageKey]?.baseURL || "",
  };

  await writeConfigFile(config);
  console.log(`Credentials saved for provider ${provider}.`);
}
