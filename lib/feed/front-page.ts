/** The front page shows the best of the last day, not everything ingested. */
export const FRONT_PAGE_WINDOW_HOURS = 24;
export const FRONT_PAGE_LIMIT = 20;
/** Below this many recent stories, older top stories fill the page. */
export const FRONT_PAGE_MINIMUM = 12;
/** Rows read per query before topic balancing. */
export const FRONT_PAGE_POOL = 300;
const FRONT_PAGE_TOPIC_SHARE = 0.25;

export interface FrontPageRow {
  id: string;
  primary_topic_id: string;
}

/** Keeps score order but stops adding a topic once it fills its share. */
export function balanceTopics<T extends FrontPageRow>(rows: T[], limit = FRONT_PAGE_LIMIT): T[] {
  const cap = Math.ceil(limit * FRONT_PAGE_TOPIC_SHARE);
  const perTopic = new Map<string, number>();
  const seen = new Set<string>();
  const picked: T[] = [];
  for (const row of rows) {
    if (picked.length >= limit) break;
    if (seen.has(row.id)) continue;
    const count = perTopic.get(row.primary_topic_id) ?? 0;
    if (count >= cap) continue;
    perTopic.set(row.primary_topic_id, count + 1);
    seen.add(row.id);
    picked.push(row);
  }
  return picked;
}

/**
 * Picks the front page from rows already sorted by final_score (best first).
 * `recent` holds the last FRONT_PAGE_WINDOW_HOURS; `fallback` (all-time best)
 * only tops the page up when the recent window is thin, e.g. right after setup.
 */
export function selectFrontPage<T extends FrontPageRow>(recent: T[], fallback: T[] = []): T[] {
  const picked = balanceTopics(recent);
  if (picked.length >= FRONT_PAGE_MINIMUM || !fallback.length) return picked;
  return balanceTopics([...picked, ...fallback]);
}
