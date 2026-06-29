import { createFindTool, createGrepTool } from "@earendil-works/pi-coding-agent";

export function createSearchTools(cwd: string) {
  return [createGrepTool(cwd), createFindTool(cwd)];
}
