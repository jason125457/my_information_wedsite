import { describe, expect, it } from "vitest";

import { summarizeJob } from "@/lib/jobs/load";
import type { Database } from "@/lib/supabase/database.types";

type JobRow = Database["public"]["Tables"]["job_runs"]["Row"];

describe("job history presentation", () => {
  it("extracts per-source counts and errors from ingestion metadata", () => {
    const row: JobRow = {
      id: "job-1",
      job_type: "ingestion",
      started_at: "2026-09-12T00:00:00Z",
      finished_at: "2026-09-12T00:00:10Z",
      status: "partial",
      items_processed: 2,
      error_message: null,
      metadata: { sources: [
        { sourceName: "Official Blog", fetchedCount: 4, insertedCount: 2, error: null },
        { sourceName: "Broken Feed", fetchedCount: 0, insertedCount: 0, error: "Request failed" },
      ] },
    };

    expect(summarizeJob(row).sources).toEqual([
      { name: "Official Blog", fetched: 4, inserted: 2, error: null },
      { name: "Broken Feed", fetched: 0, inserted: 0, error: "Request failed" },
    ]);
  });

  it("ignores malformed source metadata without breaking the page", () => {
    const row: JobRow = {
      id: "job-2",
      job_type: "daily_digest",
      started_at: "2026-09-12T00:00:00Z",
      finished_at: null,
      status: "running",
      items_processed: 0,
      error_message: null,
      metadata: { sources: [null, 3, { sourceName: "Feed", fetchedCount: -4, insertedCount: "bad" }] },
    };

    expect(summarizeJob(row).sources).toEqual([{ name: "Feed", fetched: 0, inserted: 0, error: null }]);
  });
});
