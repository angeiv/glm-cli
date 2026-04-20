#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const projectRoot = process.cwd();
const entryPoint = resolve(projectRoot, "src/models/glm-profile-core.ts");
const outputFile = resolve(
  projectRoot,
  "resources/extensions/shared/glm-profile.js",
);

mkdirSync(dirname(outputFile), { recursive: true });

execFileSync(
  "npx",
  [
    "esbuild",
    entryPoint,
    "--outfile=" + outputFile,
    "--format=esm",
    "--platform=node",
    "--bundle",
    "--banner:js=// GENERATED FROM src/models/glm-profile-core.ts. DO NOT EDIT.",
  ],
  {
    cwd: projectRoot,
    stdio: "pipe",
  },
);
