import { readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  cp as cpAsync,
  mkdir as mkdirAsync,
  readdir as readdirAsync,
  rm as rmAsync,
} from "node:fs/promises";
import { dirname, join, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "@mariozechner/pi-coding-agent";

const here = dirname(fileURLToPath(import.meta.url));
const resourcesRoot = resolve(here, "../../resources");

/**
 * Set lastChangelogVersion in the upstream settings file so that no changelog
 * entries are considered "new" on startup, suppressing the "Updated to vX.Y.Z"
 * notice by default.
 */
function suppressChangelogNoticeIfNeeded(agentDir: string): void {
  if (!VERSION) return;

  const settingsPath = join(agentDir, "settings.json");

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, "utf-8");
      const parsed = JSON.parse(content) as Record<string, unknown>;
      settings = parsed;
    } catch {
      // Corrupt file — start fresh.
    }
  }

  // Only write if version has changed or key doesn't exist yet.
  if (settings.lastChangelogVersion === VERSION) return;

  settings.lastChangelogVersion = VERSION;

  try {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
  } catch {
    // Ignore write errors — non-critical.
  }
}

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

  await mkdirAsync(dest, { recursive: true });
  const entries = await readdirAsync(src, { withFileTypes: true });

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
      await cpAsync(srcPath, destPath, { force: true });
    }
  }
}

export async function syncPackagedResources(agentDir: string): Promise<void> {
  await mkdirAsync(agentDir, { recursive: true });
  await copyDirFiltered(resourcesRoot, agentDir);

  // Clean up older installs that synced glm-mcp into ~/.glm/agent/extensions.
  // Keeping the stale directory would make Pi load it (slow) even though glm
  // now ships the MCP integration inline.
  await rmAsync(join(agentDir, "extensions", "glm-mcp"), { recursive: true, force: true });

  // Suppress the "Updated to vX.Y.Z" startup notice by default.
  suppressChangelogNoticeIfNeeded(agentDir);
}
