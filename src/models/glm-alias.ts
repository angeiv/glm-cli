const EXPLICIT_ALIAS_MAP = new Map<string, string>([
  ["glm5", "glm-5"],
  ["glm51", "glm-5.1"],
  ["glm5.1", "glm-5.1"],
  ["glm5-1", "glm-5.1"],
  ["glm5p1", "glm-5.1"],
  ["glm-5-1", "glm-5.1"],
  ["glm-5p1", "glm-5.1"],
  ["zhipuai/glm-5", "glm-5"],
  ["zhipuai/glm-5-1", "glm-5.1"],
  ["z-ai/glm-5", "glm-5"],
  ["z-ai/glm-5-1", "glm-5.1"],
  ["z-ai/glm-5.1", "glm-5.1"],
]);

const KNOWN_CANONICAL_IDS = new Set([
  "glm-5.1",
  "glm-5",
  "glm-5-turbo",
  "glm-4.7",
  "glm-4.7-flash",
  "glm-4.7-flashx",
  "glm-4.6",
  "glm-4.5-air",
  "glm-4.5-airx",
  "glm-4.5-flash",
  "glm-4-flash-250414",
  "glm-4-flashx-250414",
]);

function normalizeModelId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/:+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/-+/g, "-");
}

function extractCandidateSegments(value: string): string[] {
  const normalized = normalizeModelId(value);
  const candidates = new Set<string>();
  if (normalized) {
    candidates.add(normalized);
  }

  const lastGlmIndex = normalized.lastIndexOf("glm");
  if (lastGlmIndex >= 0) {
    candidates.add(normalized.slice(lastGlmIndex));
  }

  const slashSegments = normalized.split("/").filter(Boolean);
  if (slashSegments.length > 0) {
    candidates.add(slashSegments[slashSegments.length - 1]);
  }

  return [...candidates];
}

function normalizeGlmNumericForms(candidate: string): string {
  let next = candidate;

  next = next.replace(/^glm(?=\d)/, "glm-");
  next = next.replace(/^glm-(\d)p(\d)(?=$|-)/, "glm-$1.$2");
  next = next.replace(/^glm-(\d)-(\d)(?=$|-)/, "glm-$1.$2");
  next = next.replace(/^glm(\d)\.(\d)(?=$|-)/, "glm-$1.$2");
  next = next.replace(/^glm(\d)(\d)(?=$|-)/, "glm-$1.$2");

  return next;
}

export function resolveCanonicalGlmModelId(modelId: string): string | undefined {
  for (const rawCandidate of extractCandidateSegments(modelId)) {
    const explicit = EXPLICIT_ALIAS_MAP.get(rawCandidate);
    if (explicit) {
      return explicit;
    }

    const normalized = normalizeGlmNumericForms(rawCandidate);
    if (KNOWN_CANONICAL_IDS.has(normalized)) {
      return normalized;
    }
  }

  return undefined;
}
