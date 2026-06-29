import {
  createEditTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";

export function createFileTools(cwd: string) {
  return [createEditTool(cwd), createReadTool(cwd), createWriteTool(cwd), createLsTool(cwd)];
}
