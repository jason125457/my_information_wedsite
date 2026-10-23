export type Job = "ingest" | "digest" | "weekly";

/**
 * Which GitHub Actions jobs to start for an hourly cron tick (times in UTC).
 * - every even hour: ingest (Taipei 00:23, 02:23, … 22:23)
 * - 14:xx UTC (22:xx Taipei): ingest, then the Daily Digest, so the digest
 *   sees the latest stories (the workflow's concurrency group runs them in order)
 * - Sunday 13:xx UTC (21:xx Taipei): the weekly review
 */
export function jobsFor(time: Date): Job[] {
  const hour = time.getUTCHours();
  const jobs: Job[] = [];
  if (hour % 2 === 0) jobs.push("ingest");
  if (hour === 14) jobs.push("digest");
  if (time.getUTCDay() === 0 && hour === 13) jobs.push("weekly");
  return jobs;
}

export interface DispatchTarget {
  token: string;
  repository: string;
  workflow: string;
  ref: string;
}

/** Starts one workflow_dispatch run; GitHub answers 204 with no body on success. */
export async function dispatchJob(target: DispatchTarget, job: Job, fetchImplementation: typeof fetch = fetch) {
  const response = await fetchImplementation(
    `https://api.github.com/repos/${target.repository}/actions/workflows/${target.workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${target.token}`,
        "Content-Type": "application/json",
        "User-Agent": "personal-feed-scheduler",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: target.ref, inputs: { job } }),
    },
  );
  if (response.status !== 204) {
    throw new Error(`GitHub dispatch for "${job}" failed with HTTP ${response.status}.`);
  }
}
