export interface DigestCandidate {
  id: string;
  finalScore: number;
  contentType: "current" | "discovery";
}

export interface DigestSelectionOptions {
  limit?: number;
  minimumScore?: number;
  discoveryRatio?: number;
}

export function selectDailyDigest<T extends DigestCandidate>(
  candidates: T[],
  options: DigestSelectionOptions = {},
): T[] {
  const limit = clampInteger(options.limit ?? 20, 1, 50);
  const minimumScore = clamp(options.minimumScore ?? 55, 0, 100);
  const discoveryTarget = Math.floor(limit * clamp(options.discoveryRatio ?? 0.2, 0, 1));
  const eligible = deduplicate(candidates)
    .filter((candidate) => candidate.finalScore >= minimumScore)
    .sort((first, second) => second.finalScore - first.finalScore);
  const discovery = eligible
    .filter((candidate) => candidate.contentType === "discovery")
    .slice(0, discoveryTarget);
  const selectedIds = new Set(discovery.map((candidate) => candidate.id));
  const remaining = eligible
    .filter((candidate) => !selectedIds.has(candidate.id))
    .slice(0, Math.max(0, limit - discovery.length));

  return [...discovery, ...remaining]
    .sort((first, second) => second.finalScore - first.finalScore)
    .slice(0, limit);
}

function deduplicate<T extends DigestCandidate>(candidates: T[]) {
  const byId = new Map<string, T>();
  for (const candidate of candidates) {
    const existing = byId.get(candidate.id);
    if (!existing || candidate.finalScore > existing.finalScore) byId.set(candidate.id, candidate);
  }
  return [...byId.values()];
}

function clampInteger(value: number, minimum: number, maximum: number) {
  return Math.round(clamp(value, minimum, maximum));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
