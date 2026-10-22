import type { StructuredAIProvider, StructuredGenerationRequest } from "@/lib/ai/provider";
import type { Classification, DuplicateDecision, StorySummary } from "@/lib/ai/schemas";

/** One serialized candidate as the editor sends it inside a batch request. */
export interface BatchInputItem {
  index: number;
  title: string;
  url: string;
  [key: string]: unknown;
}

interface BatchProviderHandlers {
  classify?: (item: BatchInputItem) => Classification | Promise<Classification>;
  summarize?: (item: BatchInputItem) => StorySummary | Promise<StorySummary>;
  decideDuplicate?: () => DuplicateDecision;
  onRequest?: (request: StructuredGenerationRequest<unknown>, items: BatchInputItem[]) => void | Promise<void>;
}

/** Fake Gemini provider that answers batch requests item by item. */
export function createBatchProvider(handlers: BatchProviderHandlers): StructuredAIProvider {
  return {
    async generate<T>(request: StructuredGenerationRequest<T>) {
      const items: BatchInputItem[] = request.schemaName.endsWith("_batch")
        ? (JSON.parse(request.input) as { items: BatchInputItem[] }).items
        : [];
      await handlers.onRequest?.(request as StructuredGenerationRequest<unknown>, items);

      if (request.schemaName === "story_classification_batch") {
        if (!handlers.classify) throw new Error("Unexpected classification request.");
        const results = await Promise.all(
          items.map(async (item) => ({ index: item.index, ...(await handlers.classify!(item)) })),
        );
        return request.schema.parse({ items: results });
      }
      if (request.schemaName === "story_summary_batch") {
        if (!handlers.summarize) throw new Error("Unexpected summary request.");
        const results = await Promise.all(
          items.map(async (item) => ({ index: item.index, ...(await handlers.summarize!(item)) })),
        );
        return request.schema.parse({ items: results });
      }
      if (request.schemaName === "duplicate_decision") {
        return request.schema.parse(
          handlers.decideDuplicate?.() ?? { same_event: false, confidence: 0.9, reason: "Different events." },
        );
      }
      throw new Error(`Unknown schema: ${request.schemaName}`);
    },
  };
}
