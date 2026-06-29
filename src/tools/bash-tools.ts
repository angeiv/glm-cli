import { createBashTool } from "@earendil-works/pi-coding-agent";

export function createBashTools(cwd: string) {
  return [createBashTool(cwd)];
}
