import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";
import {
  type RuntimeCliFlags,
  type RuntimeConfig,
  resolveNotificationRuntimeOptions,
  resolveDiagnosticsRuntimeOptions,
  resolveLoopRuntimeOptions,
  resolveRuntimeConfig,
} from "../app/env.js";
import { getGlmAgentDir } from "../app/dirs.js";
import { readConfigFile, type GlmConfigFile } from "../app/config-store.js";
import type { ApiKind, ProviderName } from "../providers/types.js";
import { getProviderCredentialSource } from "../providers/types.js";
import { buildRuntimeStatus, formatRuntimeStatusLines } from "../diagnostics/runtime-status.js";
import type { RuntimeStatus } from "../diagnostics/types.js";
import { resolveGlmSessionPaths } from "../session/session-paths.js";

export type DoctorCheck = {
  id: "cwd" | "credentials" | "resources";
  ok: boolean;
  details: string;
};

export type DoctorResult = {
  ok: boolean;
  checks: DoctorCheck[];
  runtime?: RuntimeConfig;
  status?: RuntimeStatus;
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

async function checkCwd(
  cwd: string,
  pathExists: (path: string) => Promise<boolean>,
): Promise<DoctorCheck> {
  const ok = Boolean(cwd) && (await pathExists(cwd));
  return {
    id: "cwd",
    ok,
    details: ok ? `working directory ${cwd} exists` : "working directory unavailable",
  };
}

function hasConfigCredential(config: GlmConfigFile, storageKey: ProviderName) {
  const stored = config.providers[storageKey]?.apiKey ?? "";
  return Boolean(stored?.trim());
}

function hasEnvCredential(env: NodeJS.ProcessEnv, key: string): boolean {
  return Boolean(env[key]?.trim());
}

function credentialDetails(
  provider: ProviderName,
  api: ApiKind,
  env: NodeJS.ProcessEnv,
  config: GlmConfigFile,
): DoctorCheck {
  const source = getProviderCredentialSource(provider, api);
  const envKey =
    source === "anthropic"
      ? "ANTHROPIC_AUTH_TOKEN"
      : source === "openai"
        ? "OPENAI_API_KEY"
        : "GLM_API_KEY";
  let ok = hasEnvCredential(env, envKey);
  let details = "";

  if (!ok && hasConfigCredential(config, provider)) {
    ok = true;
    details = `${provider} api key stored in config`;
  } else if (ok) {
    details = `${provider} api key detected via ${envKey}`;
  } else {
    details = `missing ${envKey} or stored ${provider} credentials`;
  }

  return {
    id: "credentials",
    ok,
    details,
  };
}

async function checkResources(
  agentDir: string,
  pathExists: (path: string) => Promise<boolean>,
): Promise<DoctorCheck> {
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
  const loop = resolveLoopRuntimeOptions(options.cli, options.env, config);
  const diagnostics = resolveDiagnosticsRuntimeOptions(config);
  const notifications = resolveNotificationRuntimeOptions(options.env, config);

  const checks = await Promise.all([
    checkCwd(options.cwd, options.pathExists),
    Promise.resolve(credentialDetails(runtime.provider, runtime.api, options.env, config)),
    checkResources(options.agentDir, options.pathExists),
  ]);

  return {
    ok: checks.every((check) => check.ok),
    checks,
    runtime,
    status: await buildRuntimeStatus({
      cwd: options.cwd,
      runtime,
      loop,
      diagnostics,
      notifications,
      paths: resolveGlmSessionPaths(options.cwd),
      env: options.env,
      config,
    }),
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
  if (result.status) {
    console.log("");
    formatRuntimeStatusLines(result.status).forEach((line) => {
      console.log(line);
    });
  }

  if (!result.ok) {
    console.warn(
      "doctor detected issues; set provider credentials (GLM_API_KEY, OPENAI_API_KEY, or ANTHROPIC_AUTH_TOKEN) and retry",
    );
  }

  return result.ok ? 0 : 1;
}
