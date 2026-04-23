#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function listExtensionDirs(extensionsDir) {
  return readdirSync(extensionsDir)
    .map((name) => ({
      name,
      path: join(extensionsDir, name),
    }))
    .filter((entry) => statSync(entry.path).isDirectory());
}

export async function buildResourceExtensions(rootDir = process.cwd()) {
  const resourcesDir = join(rootDir, "resources");
  const extensionsDir = join(resourcesDir, "extensions");

  console.log("Generating shared GLM profile runtime helper...");
  execSync("node scripts/generate-glm-profile-resource.mjs", {
    stdio: "pipe",
    cwd: rootDir,
  });

  console.log("Compiling extensions...");
  if (!existsSync(extensionsDir)) {
    return;
  }

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
          cwd: rootDir,
        },
      );
    } catch {
      console.log("    tsc failed, trying esbuild...");
      execSync(
        `npx esbuild "${tsFile}" --outfile="${jsFile}" --format=esm --platform=node --bundle --external:@mariozechner/* --external:node:*`,
        {
          stdio: "pipe",
          cwd: rootDir,
        },
      );
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildResourceExtensions().catch((err) => {
    console.error("Failed to build resource extensions:", err);
    process.exit(1);
  });
}
