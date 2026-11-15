import "server-only";

import type { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  evaluateSourceHealth,
  type HealthRun,
  type HealthSourceRun,
  type SourceHealthIssue,
} from "@/lib/jobs/source-health";

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

const HEALTH_WINDOW_DAYS = 16;

/** Sources with repeated failures or no inserted story for 14 days, from recent ingestion runs. */
export async function loadSourceHealth(supabase: ServerClient, now = new Date()): Promise<SourceHealthIssue[]> {
  const since = new Date(now.getTime() - HEALTH_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("job_runs")
    .select("started_at,metadata")
    .eq("job_type", "ingestion")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`Unable to load source health: ${error.message}`);
  const runs: HealthRun[] = (data ?? []).map((row) => ({
    startedAt: row.started_at,
    sources: healthSourcesFromMetadata(row.metadata),
  }));
  return evaluateSourceHealth(runs, now);
}

function healthSourcesFromMetadata(metadata: Json | undefined): HealthSourceRun[] {
  const record = asRecord(metadata);
  if (!Array.isArray(record?.sources)) return [];
  return record.sources.flatMap((value): HealthSourceRun[] => {
    const source = asRecord(value);
    if (!source || typeof source.sourceName !== "string") return [];
    return [{
      sourceId: typeof source.sourceId === "string" ? source.sourceId : undefined,
      name: source.sourceName,
      type: typeof source.sourceType === "string" ? source.sourceType : undefined,
      fetched: nonNegativeNumber(source.fetchedCount),
      inserted: nonNegativeNumber(source.insertedCount),
      error: typeof source.error === "string" && source.error ? source.error : null,
    }];
  });
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
