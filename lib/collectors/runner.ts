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
