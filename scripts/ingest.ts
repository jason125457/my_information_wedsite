/**
 * Scheduled ingestion entry point, run by GitHub Actions (.github/workflows/jobs.yml).
 * Collects sources, runs the Gemini pipeline, and writes stories to Supabase.
 */
import { ingestSources } from "@/lib/pipeline/ingest";

async function main() {
  const result = await ingestSources();
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "failed") process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
