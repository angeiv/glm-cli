import { getGlmConfigPath, getGlmRootDir } from "./dirs.js";
import * as fsPromises from "node:fs/promises";

export const fileSystem = {
  readFile: fsPromises.readFile,
  mkdir: fsPromises.mkdir,
  writeFile: fsPromises.writeFile,
};

export type ProviderConfig = {
  apiKey: string;
  baseURL: string;
};

export type StorageProviderKey = "glmOfficial" | "openAICompatible";
export type ApprovalPolicy = "ask" | "auto" | "never";

type LegacyPersistedProviderName = "glm-official";
type PersistedProviderName = "glm" | "openai-compatible";
const PERSISTED_PROVIDER_NAMES: PersistedProviderName[] = ["glm", "openai-compatible"];

const STORAGE_KEY_TO_PROVIDER: Record<StorageProviderKey, PersistedProviderName> = {
  glmOfficial: "glm",
  openAICompatible: "openai-compatible",
};

const VALID_APPROVAL_POLICIES: ApprovalPolicy[] = ["ask", "auto", "never"];

const BASE_DEFAULT_CONFIG_FILE = buildDefaultConfigFile();

function createEmptyProviderConfig(): ProviderConfig {
  return { apiKey: "", baseURL: "" };
}

function buildDefaultConfigFile(): GlmConfigFile {
  return {
    defaultProvider: STORAGE_KEY_TO_PROVIDER.glmOfficial,
    defaultModel: "glm-5.1",
    approvalPolicy: "ask",
    providers: {
      glmOfficial: createEmptyProviderConfig(),
      openAICompatible: createEmptyProviderConfig(),
    },
  };
}

export type GlmConfigFile = {
  defaultProvider?: PersistedProviderName;
  defaultModel?: string;
  approvalPolicy?: ApprovalPolicy;
  providers: Record<StorageProviderKey, ProviderConfig>;
};

function normalizePersistedProviderName(value: unknown): PersistedProviderName | undefined {
  if (value === "glm-official") {
    return "glm";
  }
  if (PERSISTED_PROVIDER_NAMES.includes(value as PersistedProviderName)) {
    return value as PersistedProviderName;
  }
  return undefined;
}

function cloneProviderConfig(config?: ProviderConfig): ProviderConfig {
  return {
    apiKey: config?.apiKey ?? "",
    baseURL: config?.baseURL ?? "",
  };
}

export function normalizeConfigFile(config?: Partial<GlmConfigFile>): GlmConfigFile {
  const rawDefaultProvider = (config as unknown as { defaultProvider?: unknown })?.defaultProvider;
  const defaultProvider =
    rawDefaultProvider === undefined
      ? BASE_DEFAULT_CONFIG_FILE.defaultProvider
      : normalizePersistedProviderName(rawDefaultProvider) ?? (rawDefaultProvider as PersistedProviderName);

  return {
    defaultProvider,
    defaultModel: config?.defaultModel ?? BASE_DEFAULT_CONFIG_FILE.defaultModel,
    approvalPolicy: config?.approvalPolicy ?? BASE_DEFAULT_CONFIG_FILE.approvalPolicy,
    providers: {
      glmOfficial: cloneProviderConfig(
        config?.providers?.glmOfficial ?? BASE_DEFAULT_CONFIG_FILE.providers.glmOfficial,
      ),
      openAICompatible: cloneProviderConfig(
        config?.providers?.openAICompatible ?? BASE_DEFAULT_CONFIG_FILE.providers.openAICompatible,
      ),
    },
  };
}

export function getDefaultConfigFile(): GlmConfigFile {
  return normalizeConfigFile();
}

export function mapStorageKeyToProvider(key: StorageProviderKey): PersistedProviderName {
  return STORAGE_KEY_TO_PROVIDER[key];
}

function isPersistedProviderName(value?: string): value is PersistedProviderName {
  return PERSISTED_PROVIDER_NAMES.includes(value as PersistedProviderName);
}

function isApprovalPolicy(value?: string): value is ApprovalPolicy {
  return VALID_APPROVAL_POLICIES.includes(value as ApprovalPolicy);
}

function validateConfigFile(config: GlmConfigFile): void {
  if (!isPersistedProviderName(config.defaultProvider)) {
    throw new Error(`Invalid default provider in config file: ${config.defaultProvider}`);
  }

  if (typeof config.defaultModel !== "string") {
    throw new Error(`Invalid defaultModel in config file: ${typeof config.defaultModel}`);
  }

  if (!isApprovalPolicy(config.approvalPolicy)) {
    throw new Error(`Invalid approval policy in config file: ${config.approvalPolicy}`);
  }

  Object.entries(config.providers).forEach(([key, value]) => {
    validateProviderConfig(value, key as StorageProviderKey);
  });
}

function validateProviderConfig(config: ProviderConfig, key: StorageProviderKey): void {
  if (typeof config.apiKey !== "string") {
    throw new Error(`Invalid apiKey for provider ${key}: ${typeof config.apiKey}`);
  }
  if (typeof config.baseURL !== "string") {
    throw new Error(`Invalid baseURL for provider ${key}: ${typeof config.baseURL}`);
  }
}

export async function readConfigFile(): Promise<GlmConfigFile> {
  try {
    const contents = await fileSystem.readFile(getGlmConfigPath(), "utf8");
    const parsed = JSON.parse(contents) as Partial<GlmConfigFile>;
    const normalized = normalizeConfigFile(parsed);
    validateConfigFile(normalized);
    return normalized;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return getDefaultConfigFile();
    }
    throw err;
  }
}

export async function writeConfigFile(config: GlmConfigFile): Promise<void> {
  await fileSystem.mkdir(getGlmRootDir(), { recursive: true });
  await fileSystem.writeFile(
    getGlmConfigPath(),
    JSON.stringify(normalizeConfigFile(config), null, 2),
    "utf8",
  );
}
