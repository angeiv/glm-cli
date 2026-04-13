import { join } from "node:path";
import { getGlmAgentDir, getGlmRootDir } from "../app/dirs.js";

export type GlmSessionPaths = {
  agentDir: string;
  sessionDir: string;
  authPath: string;
  modelsPath: string;
};

export function resolveGlmSessionPaths(cwd: string): GlmSessionPaths {
  const agentDir = getGlmAgentDir();

  return {
    agentDir,
    sessionDir: join(
      getGlmRootDir(),
      "sessions",
      `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`,
    ),
    authPath: join(agentDir, "auth.json"),
    modelsPath: join(agentDir, "models.json"),
  };
}
