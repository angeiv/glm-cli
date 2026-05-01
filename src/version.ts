import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = join(here, "../package.json");

let VERSION: string;
try {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: string };
  VERSION = packageJson.version ?? "0.0.0";
} catch {
  VERSION = "0.0.0";
}

export { VERSION };
