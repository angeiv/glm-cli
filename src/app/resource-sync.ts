import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const resourcesRoot = resolve(here, "../../resources");

/**
 * Recursively copy directory, filtering out TypeScript source files.
 * Only .js files are copied for extensions; other files are copied as-is.
 */
async function copyDirFiltered(src: string, dest: string): Promise<void> {
  // glm-mcp is shipped as an inline extension (loaded from the package) to avoid
  // the expensive jiti load path from ~/.glm/agent. Keep the on-disk agent copy
  // free of this extension to speed up startup/resume.
  if (src.includes(`${sep}extensions${sep}glm-mcp`)) {
    return;
  }

  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirFiltered(srcPath, destPath);
    } else if (entry.isFile()) {
      // Skip TypeScript source files in extensions directory
      if (srcPath.includes(`${sep}extensions${sep}`) && extname(srcPath) === ".ts") {
        continue;
      }
      await cp(srcPath, destPath, { force: true });
    }
  }
}

export async function syncPackagedResources(agentDir: string): Promise<void> {
  await mkdir(agentDir, { recursive: true });
  await copyDirFiltered(resourcesRoot, agentDir);

  // Clean up older installs that synced glm-mcp into ~/.glm/agent/extensions.
  // Keeping the stale directory would make Pi load it (slow) even though glm
  // now ships the MCP integration inline.
  await rm(join(agentDir, "extensions", "glm-mcp"), { recursive: true, force: true });
}
