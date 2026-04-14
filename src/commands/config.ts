import {
  getDefaultConfigFile,
  readConfigFile,
  type ApprovalPolicy,
  type GlmConfigFile,
  writeConfigFile,
} from "../app/config-store.js";

const CONFIG_KEYS = ["defaultProvider", "defaultModel", "approvalPolicy"] as const;
type ConfigKey = (typeof CONFIG_KEYS)[number];

type ConfigDependencies = {
  readConfigFile: typeof readConfigFile;
  writeConfigFile: typeof writeConfigFile;
  log: (message: string) => void;
};

function isConfigKey(value: string): value is ConfigKey {
  return CONFIG_KEYS.includes(value as ConfigKey);
}

function getConfigValue(config: GlmConfigFile, key: ConfigKey): string {
  if (key === "defaultModel") {
    return config.defaultModel ?? "";
  }
  if (key === "approvalPolicy") {
    return config.approvalPolicy ?? "ask";
  }
  return config.defaultProvider ?? "glm";
}

function parseConfigValue(key: ConfigKey, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${key} cannot be empty`);
  }

  if (key === "defaultProvider") {
    if (trimmed !== "glm" && trimmed !== "openai-compatible") {
      throw new Error("defaultProvider must be glm or openai-compatible");
    }
  }

  if (key === "approvalPolicy" && !["ask", "auto", "never"].includes(trimmed)) {
    throw new Error("approvalPolicy must be ask, auto, or never");
  }

  return trimmed;
}

export async function showConfig(): Promise<GlmConfigFile> {
  return readConfigFile();
}

export async function resetConfig(): Promise<GlmConfigFile> {
  const defaults = getDefaultConfigFile();
  await writeConfigFile(defaults);
  return defaults;
}

export async function configGet(key: string, deps?: Partial<ConfigDependencies>): Promise<string> {
  if (!isConfigKey(key)) {
    throw new Error(`Unknown config key: ${key}`);
  }

  const config = await (deps?.readConfigFile ?? readConfigFile)();
  const value = getConfigValue(config, key);
  (deps?.log ?? console.log)(value);
  return value;
}

export async function configSet(
  key: string,
  value: string,
  deps?: Partial<ConfigDependencies>,
): Promise<GlmConfigFile> {
  if (!isConfigKey(key)) {
    throw new Error(`Unknown config key: ${key}`);
  }

  const config = await (deps?.readConfigFile ?? readConfigFile)();
  const parsedValue = parseConfigValue(key, value);

  if (key === "defaultProvider") {
    config.defaultProvider = parsedValue as GlmConfigFile["defaultProvider"];
  } else if (key === "approvalPolicy") {
    config.approvalPolicy = parsedValue as ApprovalPolicy;
  } else {
    config.defaultModel = parsedValue;
  }

  await (deps?.writeConfigFile ?? writeConfigFile)(config);
  (deps?.log ?? console.log)(`Updated ${key}=${parsedValue}`);
  return config;
}
