/**
 * Daily Digest entry point, run by GitHub Actions at 22:00 Asia/Taipei.
 * Idempotent: a second run on the same Taipei date returns the existing digest.
 */
import { generateDailyDigest } from "@/lib/digest/generate";

async function main() {
  const result = await generateDailyDigest();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
