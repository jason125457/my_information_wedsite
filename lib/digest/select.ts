export interface DigestCandidate {
  id: string;
  finalScore: number;
  contentType: "current" | "discovery";
  /** When present, limits how many picks one topic may take. */
  primaryTopicId?: string;
}

export interface DigestSelectionOptions {
  limit?: number;
  minimumScore?: number;
  discoveryRatio?: number;
  /** Share of the digest one topic may fill (0–1). */
  maxTopicShare?: number;
}

export function selectDailyDigest<T extends DigestCandidate>(
  candidates: T[],
  options: DigestSelectionOptions = {},
): T[] {
  const limit = clampInteger(options.limit ?? 20, 1, 50);
  const minimumScore = clamp(options.minimumScore ?? 55, 0, 100);
  const discoveryTarget = Math.floor(limit * clamp(options.discoveryRatio ?? 0.2, 0, 1));
  const maxPerTopic = Math.max(1, Math.ceil(limit * clamp(options.maxTopicShare ?? 0.25, 0, 1)));
  const eligible = deduplicate(candidates)
    .filter((candidate) => candidate.finalScore >= minimumScore)
    .sort((first, second) => second.finalScore - first.finalScore);

  const selected: T[] = [];
  const perTopic = new Map<string, number>();
  const pick = (pool: T[], until: number) => {
    for (const candidate of pool) {
      if (selected.length >= until) return;
      if (selected.includes(candidate)) continue;
      const topic = candidate.primaryTopicId;
      if (topic && (perTopic.get(topic) ?? 0) >= maxPerTopic) continue;
      selected.push(candidate);
      if (topic) perTopic.set(topic, (perTopic.get(topic) ?? 0) + 1);
    }
  };

  pick(eligible.filter((candidate) => candidate.contentType === "discovery"), discoveryTarget);
  pick(eligible, limit);

  return selected.sort((first, second) => second.finalScore - first.finalScore);
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
