import { getDefaultConfigFile, readConfigFile, writeConfigFile, type GlmConfigFile } from "../app/config-store.js";

export async function showConfig(): Promise<GlmConfigFile> {
  return readConfigFile();
}

export async function resetConfig(): Promise<GlmConfigFile> {
  const defaults = getDefaultConfigFile();
  await writeConfigFile(defaults);
  return defaults;
}
