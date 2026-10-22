import "server-only";

import type { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";

type JobRow = Database["public"]["Tables"]["job_runs"]["Row"];
type ServerClient = Awaited<ReturnType<typeof createClient>>;

export interface SourceJobSummary {
  name: string;
  fetched: number;
  inserted: number;
  error: string | null;
}

export interface JobSummary {
  id: string;
  type: string;
  status: JobRow["status"];
  startedAt: string;
  finishedAt: string | null;
  itemsProcessed: number;
  error: string | null;
  sources: SourceJobSummary[];
}

export async function loadRecentJobs(supabase: ServerClient, limit = 30): Promise<JobSummary[]> {
  const { data, error } = await supabase
    .from("job_runs")
    .select("id,job_type,status,started_at,finished_at,items_processed,error_message,metadata")
    .order("started_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));

  if (error) throw new Error(`Unable to load job history: ${error.message}`);
  return (data ?? []).map(summarizeJob);
}

export function summarizeJob(row: JobRow): JobSummary {
  const metadata = asRecord(row.metadata);
  const sources = Array.isArray(metadata?.sources)
    ? metadata.sources.flatMap((value): SourceJobSummary[] => {
        const source = asRecord(value);
        if (!source || typeof source.sourceName !== "string") return [];
        return [{
          name: source.sourceName,
          fetched: nonNegativeNumber(source.fetchedCount),
          inserted: nonNegativeNumber(source.insertedCount),
          error: typeof source.error === "string" ? source.error : null,
        }];
      })
    : [];

  return {
    id: row.id,
    type: row.job_type,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    itemsProcessed: row.items_processed,
    error: row.error_message,
    sources,
  };
}

function asRecord(value: Json | undefined): Record<string, Json | undefined> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function nonNegativeNumber(value: Json | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}
