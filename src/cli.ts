export type ParsedCliArgs =
  | {
      command: "chat";
      cwd: string;
      model?: string;
      provider?: string;
      yolo: boolean;
    }
  | {
      command: "run";
      cwd: string;
      task: string;
      model?: string;
      provider?: string;
      yolo: boolean;
    };

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const cwd = process.cwd();
  const yolo = argv.includes("--yolo");
  const filtered = argv.filter((value) => value !== "--yolo");

  if (filtered[0] === "run") {
    const task = filtered.slice(1).join(" ").trim() || "";
    return { command: "run", cwd, task, yolo };
  }

  return { command: "chat", cwd, yolo };
}
