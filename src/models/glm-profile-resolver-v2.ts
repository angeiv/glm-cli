import { resolveRuntimeModelProfile } from "./runtime-model-profile.js";
import type {
  GlmProfileOverrideRule,
  GlmProfileRuleMatch,
  ResolveRuntimeModelProfileInput,
} from "./runtime-model-profile.js";

export type ResolveGlmProfileV2Input = ResolveRuntimeModelProfileInput;

export type { GlmProfileOverrideRule, GlmProfileRuleMatch };

export function resolveGlmProfileV2(input: ResolveGlmProfileV2Input) {
  const profile = resolveRuntimeModelProfile(input);
  return {
    selectedModelId: profile.selectedModelId,
    canonicalModelId: profile.canonicalModelId,
    evidence: profile.evidence,
    payloadPatchPolicy: profile.payloadPatchPolicy,
    effectiveCaps: profile.effectiveCaps,
    effectiveModalities: profile.effectiveModalities,
  };
}
