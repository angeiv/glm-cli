import { createCodingTools } from "@mariozechner/pi-coding-agent";
import { createPlanTools } from "./plan-tools.js";

export function createBuiltinTools(cwd: string) {
  return createCodingTools(cwd);
}

export { createPlanTools } from "./plan-tools.js";
