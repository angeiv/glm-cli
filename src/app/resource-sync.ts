import { cp, mkdir, readdir } from "node:fs/promises";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const resourcesRoot = resolve(here, "../../resources");

/**
 * Recursively copy directory, filtering out TypeScript source files.
 * Only .js files are copied for extensions; other files are copied as-is.
 */
async function copyDirFiltered(src: string, dest: string): Promise<void> {
	await mkdir(dest, { recursive: true });
	const entries = await readdir(src, { withFileTypes: true });

	for (const entry of entries) {
		const srcPath = join(src, entry.name);
		const destPath = join(dest, entry.name);

		if (entry.isDirectory()) {
			await copyDirFiltered(srcPath, destPath);
		} else if (entry.isFile()) {
			// Skip TypeScript source files in extensions directory
			if (srcPath.includes("/extensions/") && extname(srcPath) === ".ts") {
				continue;
			}
			await cp(srcPath, destPath, { force: true });
		}
	}
}

export async function syncPackagedResources(agentDir: string): Promise<void> {
	await mkdir(agentDir, { recursive: true });
	await copyDirFiltered(resourcesRoot, agentDir);
}
