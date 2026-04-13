import { createFindTool, createGrepTool } from "@mariozechner/pi-coding-agent";

export function createSearchTools(cwd: string) {
  return [createGrepTool(cwd), createFindTool(cwd)];
}
