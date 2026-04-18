#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, cpSync, rmSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const GLM_DIR = join(homedir(), ".glm");
const AGENT_DIR = join(GLM_DIR, "agent");
const RESOURCES_DIR = join(process.cwd(), "resources");

function listExtensionDirs(extensionsDir) {
  return readdirSync(extensionsDir)
    .map((name) => ({
      name,
      path: join(extensionsDir, name),
    }))
    .filter((entry) => statSync(entry.path).isDirectory());
}

function copyResourcesFiltered(srcDir, destDir) {
  cpSync(srcDir, destDir, {
    recursive: true,
    filter: (src) => {
      if (src.endsWith(".ts") && src.includes(`${join("resources", "extensions")}${process.platform === "win32" ? "\\" : "/"}`)) {
        return false;
      }
      return true;
    },
  });
}

async function copyResources() {
  // Ensure agent directory exists
  if (!existsSync(AGENT_DIR)) {
    mkdirSync(AGENT_DIR, { recursive: true });
  }

  // Compile TypeScript extensions
  console.log("Compiling extensions...");
  const extensionsDir = join(RESOURCES_DIR, "extensions");
  if (existsSync(extensionsDir)) {
    for (const { name: extDir, path: extPath } of listExtensionDirs(extensionsDir)) {
      const tsFile = join(extPath, "index.ts");
      const jsFile = join(extPath, "index.js");

      if (!existsSync(tsFile)) {
        continue;
      }

      console.log(`  Compiling ${extDir}/index.ts...`);
      try {
        execSync(
          `npx tsc --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --outDir "${extPath}" "${tsFile}"`,
          {
            stdio: "pipe",
            cwd: process.cwd(),
          },
        );
      } catch {
        console.log("    tsc failed, trying esbuild...");
        try {
          execSync(
            `npx esbuild "${tsFile}" --outfile="${jsFile}" --format=esm --platform=node --bundle --external:@mariozechner/* --external:node:*`,
            {
              stdio: "pipe",
              cwd: process.cwd(),
            },
          );
        } catch (esbuildErr) {
          console.error(`    Failed to compile ${extDir}:`, esbuildErr.message);
        }
      }
    }
  }

  // Copy resources to agent directory
  console.log("Copying resources...");

  copyResourcesFiltered(RESOURCES_DIR, AGENT_DIR);

  console.log("Resources synced successfully.");
}

copyResources().catch((err) => {
  console.error("Failed to sync resources:", err);
  process.exit(1);
});
