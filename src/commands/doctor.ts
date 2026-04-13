import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { RuntimeCliFlags, RuntimeConfig, resolveRuntimeConfig } from "../app/env.js";
import { getGlmAgentDir } from "../app/dirs.js";
import { readConfigFile, GlmConfigFile } from "../app/config-store.js";
import type { ProviderName } from "../providers/types.js";

export type DoctorCheck = {
  id: "cwd" | "credentials" | "resources";
  ok: boolean;
  details: string;
};

export type DoctorResult = {
  ok: boolean;
  checks: DoctorCheck[];
  runtime?: RuntimeConfig;
};

export type DoctorDependencies = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  cli: RuntimeCliFlags;
  agentDir: string;
  readConfigFile: () => Promise<GlmConfigFile>;
  pathExists: (path: string) => Promise<boolean>;
};

export type DoctorCommandArgs = {
  cwd: string;
  cli: RuntimeCliFlags;
  env?: NodeJS.ProcessEnv;
};

async function defaultPathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function checkCwd(cwd: string, pathExists: (path: string) => Promise<boolean>): Promise<DoctorCheck> {
  const ok = Boolean(cwd) && (await pathExists(cwd));
  return {
    id: "cwd",
    ok,
    details: ok ? `working directory ${cwd} exists` : "working directory unavailable",
  };
}

function hasConfigCredential(config: GlmConfigFile, storageKey: "glmOfficial" | "openAICompatible") {
  const stored = config.providers[storageKey]?.apiKey ?? "";
  return Boolean(stored?.trim());
}

function credentialDetails(provider: ProviderName, env: NodeJS.ProcessEnv, config: GlmConfigFile): DoctorCheck {
  let ok = false;
  let details = "";

  if (provider === "anthropic") {
    ok = Boolean(env.ANTHROPIC_AUTH_TOKEN);
    details = ok ? "anthropic auth token detected" : "missing ANTHROPIC_AUTH_TOKEN for anthropic compatibility";
  } else if (provider === "openai-compatible") {
    ok = Boolean(env.OPENAI_API_KEY);
    if (!ok && hasConfigCredential(config, "openAICompatible")) {
      ok = true;
      details = "openai-compatible api key stored in config";
    } else if (ok) {
      details = "openai-compatible api key detected via environment";
    } else {
      details = "missing OPENAI_API_KEY or stored openai-compatible credentials";
    }
  } else {
    ok = Boolean(env.GLM_API_KEY);
    if (!ok && hasConfigCredential(config, "glmOfficial")) {
      ok = true;
      details = "glm-official api key stored in config";
    } else if (ok) {
      details = "glm-official api key detected via environment";
    } else {
      details = "missing GLM_API_KEY or stored glm-official credentials";
    }
  }

  return {
    id: "credentials",
    ok,
    details,
  };
}

async function checkResources(agentDir: string, pathExists: (path: string) => Promise<boolean>): Promise<DoctorCheck> {
  const promptPath = join(agentDir, "prompts", "system.md");
  const exists = await pathExists(promptPath);
  return {
    id: "resources",
    ok: true,
    details: exists
      ? "system prompt cached"
      : "prompts not synced yet (first session will populate ~/.glm/agent)",
  };
}

export async function runDoctor(options: DoctorDependencies): Promise<DoctorResult> {
  const config = await options.readConfigFile();
  const runtime = resolveRuntimeConfig(options.cli, options.env, config);

  const checks = await Promise.all([
    checkCwd(options.cwd, options.pathExists),
    Promise.resolve(credentialDetails(runtime.provider, options.env, config)),
    checkResources(options.agentDir, options.pathExists),
  ]);

  return {
    ok: checks.every((check) => check.ok),
    checks,
    runtime,
  };
}

export async function runDoctorCommand(input: DoctorCommandArgs): Promise<number> {
  const result = await runDoctor({
    cwd: input.cwd,
    cli: input.cli,
    env: input.env ?? process.env,
    agentDir: getGlmAgentDir(),
    readConfigFile,
    pathExists: defaultPathExists,
  });

  result.checks.forEach((check) => {
    const status = check.ok ? "ok" : "fail";
    console.log(`[${status}] ${check.id} - ${check.details}`);
  });

  if (!result.ok) {
    console.warn("doctor detected issues; run glm auth login or restore credentials and retry");
  }

  return result.ok ? 0 : 1;
}
