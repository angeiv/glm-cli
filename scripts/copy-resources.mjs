#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const GLM_DIR = join(homedir(), ".glm");
const AGENT_DIR = join(GLM_DIR, "agent");
const RESOURCES_DIR = join(process.cwd(), "resources");

async function copyResources() {
  // Ensure agent directory exists
  if (!existsSync(AGENT_DIR)) {
    mkdirSync(AGENT_DIR, { recursive: true });
  }

  // Compile TypeScript extensions
  console.log("Compiling extensions...");
  const extensionsDir = join(RESOURCES_DIR, "extensions");
  if (existsSync(extensionsDir)) {
    const extDirs = ["glm-providers", "glm-policy"];
    for (const extDir of extDirs) {
      const extPath = join(extensionsDir, extDir);
      const tsFile = join(extPath, "index.ts");
      const jsFile = join(extPath, "index.js");
      
      if (existsSync(tsFile)) {
        console.log(`  Compiling ${extDir}/index.ts...`);
        try {
          execSync(`npx tsc --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --outDir "${extPath}" "${tsFile}"`, {
            stdio: "pipe",
            cwd: process.cwd()
          });
        } catch (err) {
          // tsc might fail on imports, use esbuild as fallback
          console.log(`    tsc failed, trying esbuild...`);
          try {
            execSync(`npx esbuild "${tsFile}" --outfile="${jsFile}" --format=esm --platform=node --bundle --external:@mariozechner/* --external:node:*`, {
              stdio: "pipe",
              cwd: process.cwd()
            });
          } catch (esbuildErr) {
            console.error(`    Failed to compile ${extDir}:`, esbuildErr.message);
          }
        }
      }
    }
  }

  // Copy resources to agent directory
  console.log("Copying resources...");
  
  // Copy extensions
  const agentExtensionsDir = join(AGENT_DIR, "extensions");
  if (existsSync(agentExtensionsDir)) {
    rmSync(agentExtensionsDir, { recursive: true });
  }
  mkdirSync(agentExtensionsDir, { recursive: true });
  
  if (existsSync(extensionsDir)) {
    const dirs = ["glm-providers", "glm-policy"];
    for (const dir of dirs) {
      const srcDir = join(extensionsDir, dir);
      const destDir = join(agentExtensionsDir, dir);
      if (existsSync(srcDir)) {
        console.log(`  Copying ${dir}...`);
        mkdirSync(destDir, { recursive: true });
        // Copy only .js files, not .ts
        if (existsSync(join(srcDir, "index.js"))) {
          cpSync(join(srcDir, "index.js"), join(destDir, "index.js"));
        } else if (existsSync(join(srcDir, "index.ts"))) {
          // If no .js, copy .ts as fallback (Pi might handle it)
          cpSync(join(srcDir, "index.ts"), join(destDir, "index.ts"));
        }
      }
    }
  }

  // Copy prompts
  const promptsDir = join(RESOURCES_DIR, "prompts");
  const agentPromptsDir = join(AGENT_DIR, "prompts");
  if (existsSync(promptsDir)) {
    console.log("Copying prompts...");
    if (!existsSync(agentPromptsDir)) {
      mkdirSync(agentPromptsDir, { recursive: true });
    }
    cpSync(promptsDir, agentPromptsDir, { recursive: true });
  }

  console.log("Resources synced successfully.");
}

copyResources().catch((err) => {
  console.error("Failed to sync resources:", err);
  process.exit(1);
});
