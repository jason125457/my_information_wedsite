// Pure source-health calculation over ingestion job metadata. No new tables:
// everything comes from job_runs.metadata.sources.

export interface HealthSourceRun {
  sourceId?: string;
  name: string;
  /** sources.type, e.g. "rss" | "reddit". Reddit sources are rotated: only one per run is fetched. */
  type?: string;
  fetched: number;
  inserted: number;
  error: string | null;
}

export interface HealthRun {
  startedAt: string;
  sources: HealthSourceRun[];
}

export interface SourceHealthIssue {
  key: string;
  name: string;
  type: string | null;
  consecutiveFailures: number;
  lastError: string | null;
  /** ISO time of the latest run that inserted a story, or null if none in the window. */
  lastInsertedAt: string | null;
  /** Whole days since lastInsertedAt; null if never inside the observed window. */
  daysSinceInserted: number | null;
  failing: boolean;
  stale: boolean;
}

export interface SourceHealthOptions {
  failureThreshold?: number;
  staleDays?: number;
}

const DAY_MS = 86_400_000;

/**
 * Outcome of one source in one run:
 * - failure: an error was recorded
 * - success: fetched something without error
 * - skipped: fetched nothing and no error (e.g. a Reddit source not in this run's rotation).
 *   Skipped runs neither extend a failure streak nor break it, and never count as "no content".
 */
type Outcome = "failure" | "success" | "skipped";

function outcomeOf(source: HealthSourceRun): Outcome {
  if (source.error) return "failure";
  if (source.fetched > 0) return "success";
  return "skipped";
}

interface Accumulator {
  name: string;
  type: string | null;
  streak: number;
  streakOpen: boolean;
  lastError: string | null;
  lastInsertedAt: number | null;
  /** Oldest run where the source actually fetched or failed. */
  firstAttemptAt: number | null;
}

/** `runs` may be in any order. Returns only sources that have a problem. */
export function evaluateSourceHealth(
  runs: HealthRun[],
  now: Date,
  options: SourceHealthOptions = {},
): SourceHealthIssue[] {
  const failureThreshold = options.failureThreshold ?? 3;
  const staleDays = options.staleDays ?? 14;

  const sorted = runs
    .map((run) => ({ run, time: Date.parse(run.startedAt) }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((a, b) => b.time - a.time); // newest first

  const bySource = new Map<string, Accumulator>();

  for (const { run, time } of sorted) {
    for (const source of run.sources) {
      const key = source.sourceId ?? source.name;
      let acc = bySource.get(key);
      if (!acc) {
        acc = {
          name: source.name,
          type: source.type ?? null,
          streak: 0,
          streakOpen: true,
          lastError: null,
          lastInsertedAt: null,
          firstAttemptAt: null,
        };
        bySource.set(key, acc);
      }

      const outcome = outcomeOf(source);
      if (outcome !== "skipped") acc.firstAttemptAt = time;
      if (acc.streakOpen) {
        if (outcome === "failure") {
          acc.streak += 1;
          acc.lastError ??= source.error;
        } else if (outcome === "success") {
          acc.streakOpen = false;
        }
      }
      if (source.inserted > 0 && acc.lastInsertedAt === null) acc.lastInsertedAt = time;
    }
  }

  const issues: SourceHealthIssue[] = [];
  for (const [key, acc] of bySource) {
    const failing = acc.streak >= failureThreshold;
    // Only call a source stale once it was watched for the whole window; a source
    // with a shorter history has not had the chance to prove itself yet.
    const observedLongEnough =
      acc.firstAttemptAt !== null && now.getTime() - acc.firstAttemptAt >= staleDays * DAY_MS;
    const insertedRecently =
      acc.lastInsertedAt !== null && now.getTime() - acc.lastInsertedAt < staleDays * DAY_MS;
    const stale = observedLongEnough && !insertedRecently;
    if (!failing && !stale) continue;
    issues.push({
      key,
      name: acc.name,
      type: acc.type,
      consecutiveFailures: acc.streak,
      lastError: acc.lastError,
      lastInsertedAt: acc.lastInsertedAt === null ? null : new Date(acc.lastInsertedAt).toISOString(),
      daysSinceInserted:
        acc.lastInsertedAt === null ? null : Math.floor((now.getTime() - acc.lastInsertedAt) / DAY_MS),
      failing,
      stale,
    });
  }

  return issues.sort(
    (a, b) =>
      Number(b.failing) - Number(a.failing) ||
      b.consecutiveFailures - a.consecutiveFailures ||
      a.name.localeCompare(b.name),
  );
}
