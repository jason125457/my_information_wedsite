import { describe, expect, it, vi } from "vitest";

import { dispatchJob, jobsFor } from "@/scheduler/src/schedule";

describe("scheduler: jobs per hourly tick", () => {
  it("ingests on even UTC hours only", () => {
    expect(jobsFor(new Date("2026-10-23T06:23:00Z"))).toEqual(["ingest"]);
    expect(jobsFor(new Date("2026-10-23T07:23:00Z"))).toEqual([]);
  });

  it("runs ingest then the Daily Digest at 22:23 Taipei", () => {
    expect(jobsFor(new Date("2026-10-23T14:23:00Z"))).toEqual(["ingest", "digest"]);
  });

  it("runs the weekly review on Sunday 21:23 Taipei", () => {
    expect(jobsFor(new Date("2026-10-25T13:23:00Z"))).toEqual(["weekly"]);
    expect(jobsFor(new Date("2026-10-24T13:23:00Z"))).toEqual([]);
  });
});

describe("scheduler: GitHub dispatch", () => {
  const target = { token: "t", repository: "owner/repo", workflow: "jobs.yml", ref: "main" };

  it("posts a workflow_dispatch with the job input", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    await dispatchJob(target, "digest", fetchMock);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.github.com/repos/owner/repo/actions/workflows/jobs.yml/dispatches");
    expect(JSON.parse(String(init?.body))).toEqual({ ref: "main", inputs: { job: "digest" } });
    expect(init?.headers).toMatchObject({ Authorization: "Bearer t" });
  });

  it("throws when GitHub rejects the request", async () => {
    const fetchMock = vi.fn(async () => new Response("Bad credentials", { status: 401 }));
    await expect(dispatchJob(target, "ingest", fetchMock as typeof fetch)).rejects.toThrow("HTTP 401");
  });
});
