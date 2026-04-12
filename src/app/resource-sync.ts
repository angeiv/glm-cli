import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const resourcesRoot = resolve(here, "../../resources");

export async function syncPackagedResources(agentDir: string): Promise<void> {
  await mkdir(agentDir, { recursive: true });
  await cp(resourcesRoot, agentDir, {
    recursive: true,
    force: true,
  });
}
