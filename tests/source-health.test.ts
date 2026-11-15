import { describe, expect, it } from "vitest";

import { evaluateSourceHealth, type HealthRun, type HealthSourceRun } from "@/lib/jobs/source-health";

const now = new Date("2026-11-15T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const run = (h: number, ...sources: HealthSourceRun[]): HealthRun => ({ startedAt: hoursAgo(h), sources });
const ok = (name: string, inserted = 1, type = "rss"): HealthSourceRun => ({ sourceId: name, name, type, fetched: 5, inserted, error: null });
const fail = (name: string, type = "rss"): HealthSourceRun => ({ sourceId: name, name, type, fetched: 0, inserted: 0, error: "HTTP 404" });
const idle = (name: string, type = "reddit"): HealthSourceRun => ({ sourceId: name, name, type, fetched: 0, inserted: 0, error: null });

describe("evaluateSourceHealth", () => {
  it("flags a source with 3+ consecutive latest failures", () => {
    const issues = evaluateSourceHealth([run(6, fail("A")), run(4, fail("A")), run(2, fail("A")), run(8, ok("A"))], now);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ name: "A", consecutiveFailures: 3, failing: true, lastError: "HTTP 404" });
  });

  it("does not flag fewer than 3 failures or a streak broken by a success", () => {
    const runs = [run(6, fail("A")), run(4, fail("A")), run(2, ok("A")), run(1, fail("A"))];
    expect(evaluateSourceHealth(runs, now)).toEqual([]);
  });

  it("does not let rotation gaps (Reddit fetched 0, no error) break or extend a streak", () => {
    const runs = [run(8, fail("R", "reddit")), run(6, idle("R")), run(4, fail("R", "reddit")), run(2, idle("R")), run(1, fail("R", "reddit"))];
    expect(evaluateSourceHealth(runs, now)[0]).toMatchObject({ consecutiveFailures: 3, failing: true });
    expect(evaluateSourceHealth([run(4, fail("R", "reddit")), run(2, idle("R")), run(1, idle("R"))], now)).toEqual([]);
  });

  it("flags a source that fetched but inserted nothing for 14 days", () => {
    const runs = [run(24 * 20, ok("B", 3)), run(24 * 10, ok("B", 0)), run(2, ok("B", 0))];
    const [issue] = evaluateSourceHealth(runs, now);
    expect(issue).toMatchObject({ name: "B", stale: true, failing: false, daysSinceInserted: 20 });
  });

  it("reports a null last-inserted date when nothing was inserted in the window", () => {
    const [issue] = evaluateSourceHealth([run(24 * 15, ok("B", 0)), run(2, ok("B", 0))], now);
    expect(issue).toMatchObject({ stale: true, lastInsertedAt: null, daysSinceInserted: null });
  });

  it("does not flag a source inserting recently, or one observed for under 14 days", () => {
    expect(evaluateSourceHealth([run(24 * 20, ok("B", 0)), run(24 * 3, ok("B", 1)), run(2, ok("B", 0))], now)).toEqual([]);
    expect(evaluateSourceHealth([run(24 * 5, ok("C", 0)), run(2, ok("C", 0))], now)).toEqual([]);
  });

  it("ignores Reddit rotation idle runs for staleness", () => {
    const runs = [run(24 * 20, idle("R")), run(24 * 3, ok("R", 1, "reddit")), run(2, idle("R"))];
    expect(evaluateSourceHealth(runs, now)).toEqual([]);
  });

  it("handles unordered input and malformed timestamps", () => {
    const runs = [run(2, fail("A")), { startedAt: "nope", sources: [ok("A")] }, run(6, fail("A")), run(4, fail("A"))];
    expect(evaluateSourceHealth(runs, now)[0]?.consecutiveFailures).toBe(3);
  });
});
