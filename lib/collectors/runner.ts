import type { Collector, CollectorContext, CollectorRunResult } from "@/lib/collectors/types";

export async function runCollector(
  collector: Collector,
  context?: CollectorContext,
): Promise<CollectorRunResult> {
  try {
    const items = await collector.fetch(context);
    const candidates = items
      .map((item) => collector.normalize(item))
      .filter((candidate) => candidate !== null);

    return {
      sourceId: collector.sourceId,
      sourceName: collector.sourceName,
      sourceType: collector.sourceType,
      status: "succeeded",
      candidateCount: candidates.length,
      candidates,
    };
  } catch (error) {
    return {
      sourceId: collector.sourceId,
      sourceName: collector.sourceName,
      sourceType: collector.sourceType,
      status: "failed",
      candidateCount: 0,
      candidates: [],
      errorMessage: error instanceof Error ? error.message : "Unknown collector error.",
    };
  }
}

export async function runCollectors(collectors: Collector[], context?: CollectorContext) {
  return Promise.all(collectors.map((collector) => runCollector(collector, context)));
}

/** Runs collectors one at a time with a pause between them, for hosts that throttle bursts. */
export async function runCollectorsSequentially(
  collectors: Collector[],
  delayMs: number,
  context?: CollectorContext,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  const results: CollectorRunResult[] = [];
  for (const [index, collector] of collectors.entries()) {
    if (index > 0 && delayMs > 0) await sleep(delayMs);
    results.push(await runCollector(collector, context));
  }
  return results;
}
