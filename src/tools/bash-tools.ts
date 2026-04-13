import { createBashTool } from "@mariozechner/pi-coding-agent";

export function createBashTools(cwd: string) {
  return [createBashTool(cwd)];
}
