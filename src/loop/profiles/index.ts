import type { LoopProfileName } from "../../app/config-store.js";
import { createCodeLoopProfile } from "./code.js";
import type { LoopProfile } from "./types.js";

export function createLoopProfile(profile: LoopProfileName): LoopProfile {
  if (profile === "code") {
    return createCodeLoopProfile();
  }

  throw new Error(`Unsupported loop profile: ${profile satisfies never}`);
}
