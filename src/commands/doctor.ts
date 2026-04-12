import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { getGlmAgentDir, getGlmConfigPath } from "../app/dirs.js";

type DoctorOptions = {
  env: NodeJS.ProcessEnv;
  cwd: string;
};

type DoctorCheckResult = {
  id: string;
  ok: boolean;
  details?: string;
};

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function checkCwd(cwd: string): Promise<DoctorCheckResult> {
  const ok = Boolean(cwd) && (await pathExists(cwd));
  return {
    id: "cwd",
    ok,
    details: ok ? cwd : "working directory unavailable",
  };
}

async function checkCredentials(env: NodeJS.ProcessEnv): Promise<DoctorCheckResult> {
  const hasEnvKey = Boolean(env.GLM_API_KEY || env.OPENAI_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  if (hasEnvKey) {
    return { id: "credentials", ok: true, details: "environment API key detected" };
  }

  try {
    const raw = await readFile(getGlmConfigPath(), "utf8");
    const parsed = JSON.parse(raw);
    const glmKey = parsed?.providers?.glmOfficial?.apiKey;
    const openaiKey = parsed?.providers?.openAICompatible?.apiKey;
    if ((typeof glmKey === "string" && glmKey.trim()) || (typeof openaiKey === "string" && openaiKey.trim())) {
      return { id: "credentials", ok: true, details: "config file provides a stored api key" };
    }
  } catch (error: unknown) {
    if ((error as { code?: string }).code !== "ENOENT" && (error as { code?: string }).code !== "EACCES") {
      return { id: "credentials", ok: false, details: `config read failure: ${(error as Error).message}` };
    }
  }

  return {
    id: "credentials",
    ok: false,
    details: "missing GLM/OPENAI/ANTHROPIC credentials",
  };
}

async function checkResources(): Promise<DoctorCheckResult> {
  const promptPath = join(getGlmAgentDir(), "prompts", "system.md");
  const ok = await pathExists(promptPath);
  return {
    id: "resources",
    ok,
    details: ok ? "system prompt cached" : `missing ${promptPath}`,
  };
}

export async function runDoctor(options: DoctorOptions) {
  const checks = await Promise.all([checkCwd(options.cwd), checkCredentials(options.env), checkResources()]);
  const ok = checks.every((check) => check.ok);
  return { ok, checks };
}
