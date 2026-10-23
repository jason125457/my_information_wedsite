/**
 * Weekly review entry point, run by GitHub Actions on Sunday 21:07 Asia/Taipei.
 * Idempotent: a second run on the same Taipei date returns the existing review.
 */
import { generateWeeklyReview } from "@/lib/weekly/generate";

async function main() {
  const result = await generateWeeklyReview();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
