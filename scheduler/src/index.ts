/**
 * personal-feed-scheduler: a tiny Cloudflare Worker whose hourly Cron Trigger
 * starts the GitHub Actions jobs on time. GitHub's own `schedule` events were
 * delayed by hours or skipped; Cloudflare cron fires reliably on the free plan.
 * The work itself still runs in GitHub Actions (.github/workflows/jobs.yml).
 */
import { dispatchJob, jobsFor } from "./schedule";

interface Env {
  /** Fine-grained GitHub token: this repository only, Actions read & write. */
  GITHUB_TOKEN: string;
  GITHUB_REPOSITORY: string;
}

interface ScheduledController {
  scheduledTime: number;
  cron: string;
}

const scheduler = {
  async scheduled(controller: ScheduledController, env: Env) {
    const jobs = jobsFor(new Date(controller.scheduledTime));
    const target = { token: env.GITHUB_TOKEN, repository: env.GITHUB_REPOSITORY, workflow: "jobs.yml", ref: "main" };
    for (const job of jobs) {
      // Sequential, so ingest is queued before the digest that depends on it.
      await dispatchJob(target, job);
      console.log(`Dispatched ${job}`);
    }
  },

  async fetch() {
    return new Response("Not found", { status: 404 });
  },
};

export default scheduler;
