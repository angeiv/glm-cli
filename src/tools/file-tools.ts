import {
  createFindTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@mariozechner/pi-coding-agent";

export function createFileTools(cwd: string) {
  return [
    createReadTool(cwd),
    createWriteTool(cwd),
    createLsTool(cwd),
    createFindTool(cwd),
  ];
}
