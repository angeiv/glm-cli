#!/usr/bin/env node
import { existsSync, mkdirSync, cpSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const GLM_DIR = join(homedir(), ".glm");
const AGENT_DIR = join(GLM_DIR, "agent");
const RESOURCES_DIR = join(process.cwd(), "resources");

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

  // Copy resources to agent directory
  console.log("Copying resources...");

  copyResourcesFiltered(RESOURCES_DIR, AGENT_DIR);

  console.log("Resources synced successfully.");
}

copyResources().catch((err) => {
  console.error("Failed to sync resources:", err);
  process.exit(1);
});
