import type { LoopProfileName } from "../../app/config-store.js";
import { createCodeLoopProfile } from "./code.js";
import type { LoopProfile } from "./types.js";
import type { PromptMode } from "../../prompt/mode-overlays.js";

export function createLoopProfile(
  profile: LoopProfileName,
  promptMode: PromptMode = "intensive",
): LoopProfile {
  if (profile === "code") {
    return createCodeLoopProfile(promptMode);
  }

  throw new Error(`Unsupported loop profile: ${profile satisfies never}`);
}
