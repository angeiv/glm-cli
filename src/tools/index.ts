import { createPlanTools } from "./plan-tools.js";
import { createBashTools } from "./bash-tools.js";
import { createFileTools } from "./file-tools.js";
import { createSearchTools } from "./search-tools.js";

export function createBuiltinTools(cwd: string) {
  return [
    ...createFileTools(cwd),
    ...createSearchTools(cwd),
    ...createBashTools(cwd),
  ];
}

export { createPlanTools } from "./plan-tools.js";
