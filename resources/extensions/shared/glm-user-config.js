import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function normalizeNonEmptyString(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOverrideMatch(value) {
  if (!value || typeof value !== "object") return undefined;
  const maybe = value;

  const match = {};
  let selectors = 0;
  for (const key of ["provider", "api", "baseUrl", "modelId", "platform", "upstreamVendor", "canonicalModelId"]) {
    const normalized = normalizeNonEmptyString(maybe[key]);
    if (!normalized) continue;
    match[key] = normalized;
    selectors += 1;
  }

  // Mirror the CLI-side validation: at least one selector must be present, otherwise the
  // rule would match everything and could accidentally rewrite unrelated providers.
  if (selectors === 0) return undefined;
  return match;
}

function normalizeOverrideModalities(value) {
  if (!Array.isArray(value) || value.length === 0) return undefined;

  const modalities = [];
  for (const item of value) {
    const normalized = normalizeNonEmptyString(item)?.toLowerCase();
    if (normalized !== "text" && normalized !== "image" && normalized !== "video") continue;
    if (modalities.includes(normalized)) continue;
    modalities.push(normalized);
  }

  return modalities.length > 0 ? modalities : undefined;
}

function normalizeOverrideRule(value) {
  if (!value || typeof value !== "object") return undefined;
  const maybe = value;

  const match = normalizeOverrideMatch(maybe.match);
  if (!match) return undefined;

  const rule = { match };

  const canonicalModelId = normalizeNonEmptyString(maybe.canonicalModelId);
  if (canonicalModelId) {
    rule.canonicalModelId = canonicalModelId;
  }

  const payloadPatchPolicy = normalizeNonEmptyString(maybe.payloadPatchPolicy);
  if (payloadPatchPolicy) {
    rule.payloadPatchPolicy = payloadPatchPolicy;
  }

  const modalities = normalizeOverrideModalities(maybe.modalities);
  if (modalities) {
    rule.modalities = modalities;
  }

  const caps = maybe.caps;
  if (caps && typeof caps === "object" && !Array.isArray(caps)) {
    rule.caps = caps;
  }

  return rule;
}

export function readGlmUserConfig() {
  const configPath = join(homedir(), ".glm", "config.json");
  try {
    const contents = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(contents);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

export function readGlmModelProfileOverrides() {
  const config = readGlmUserConfig();
  const overrides = config?.modelOverrides ?? config?.modelProfiles?.overrides;
  if (!Array.isArray(overrides) || overrides.length === 0) return undefined;

  const rules = [];
  for (const item of overrides) {
    const normalized = normalizeOverrideRule(item);
    if (!normalized) continue;
    rules.push(normalized);
  }

  return rules.length > 0 ? rules : undefined;
}
