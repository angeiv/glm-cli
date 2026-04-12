import { getGlmConfigPath, getGlmRootDir } from "./dirs.js";
import * as fsPromises from "node:fs/promises";
import type { ProviderName } from "../providers/types.js";
import { isProviderName } from "../providers/types.js";
export type { ProviderName };

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

const STORAGE_KEY_TO_PROVIDER: Record<StorageProviderKey, ProviderName> = {
  glmOfficial: "glm-official",
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
    defaultModel: "glm-5",
    approvalPolicy: "ask",
    providers: {
      glmOfficial: createEmptyProviderConfig(),
      openAICompatible: createEmptyProviderConfig(),
    },
  };
}

export type GlmConfigFile = {
  defaultProvider?: ProviderName;
  defaultModel?: string;
  approvalPolicy?: ApprovalPolicy;
  providers: Record<StorageProviderKey, ProviderConfig>;
};

function cloneProviderConfig(config?: ProviderConfig): ProviderConfig {
  return {
    apiKey: config?.apiKey ?? "",
    baseURL: config?.baseURL ?? "",
  };
}

export function normalizeConfigFile(config?: Partial<GlmConfigFile>): GlmConfigFile {
  return {
    defaultProvider: config?.defaultProvider ?? BASE_DEFAULT_CONFIG_FILE.defaultProvider,
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

export function mapStorageKeyToProvider(key: StorageProviderKey): ProviderName {
  return STORAGE_KEY_TO_PROVIDER[key];
}

function isApprovalPolicy(value?: string): value is ApprovalPolicy {
  return VALID_APPROVAL_POLICIES.includes(value as ApprovalPolicy);
}

function validateConfigFile(config: GlmConfigFile): void {
  if (!isProviderName(config.defaultProvider)) {
    throw new Error(`Invalid default provider in config file: ${config.defaultProvider}`);
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
