import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.hoisted(() => vi.fn());
const supabaseHolder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/line/push", () => ({ sendLineDigestNotification: pushMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => supabaseHolder.client }));

import { generateDailyDigest } from "@/lib/digest/generate";

/** Tiny chainable stand-in for the Supabase queries generateDailyDigest makes. */
function createClient() {
  const jobUpdates: Array<Record<string, unknown>> = [];
  const now = new Date("2026-11-14T12:00:00Z").toISOString();
  const stories = [
    { id: "s1", final_score: 90, content_type: "current", primary_topic_id: "t1", published_at: now, created_at: now },
  ];

  function query(table: string) {
    const result = (data: unknown) => ({ data, error: null, count: 0 });
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.eq = chain;
    builder.in = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.maybeSingle = async () => result(null);
    builder.single = async () => result(table === "job_runs" ? { id: "job-1" } : { id: "digest-1" });
    builder.insert = () => builder;
    builder.delete = chain;
    builder.update = (payload: Record<string, unknown>) => {
      jobUpdates.push(payload);
      return { eq: async () => ({ error: null }) };
    };
    builder.then = (resolve: (value: unknown) => unknown) => {
      if (table === "stories") return resolve(result(stories));
      if (table === "topics") return resolve(result([{ id: "t1", name: "AI" }]));
      return resolve(result([]));
    };
    return builder;
  }

  return { client: { from: query }, jobUpdates };
}

describe("daily digest LINE handling", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    pushMock.mockReset();
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    delete process.env.LINE_TARGET_USER_ID;
    delete process.env.APP_URL;
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("is succeeded, not partial, when LINE is not configured", async () => {
    const { client, jobUpdates } = createClient();
    supabaseHolder.client = client;

    const result = await generateDailyDigest(new Date("2026-11-14T14:00:00Z"));

    expect(result.status).toBe("created");
    expect(result.lineNotified).toBe(false);
    expect(result.lineSkipped).toBe("not_configured");
    expect(result.warning).toBeUndefined();
    expect(pushMock).not.toHaveBeenCalled();
    const final = jobUpdates.at(-1)!;
    expect(final.status).toBe("succeeded");
    expect(final.error_message).toBeNull();
    expect(final.metadata).toMatchObject({ lineNotified: false, lineSkipped: "not_configured" });
  });

  it("stays partial when LINE is configured but the push fails", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "token";
    process.env.LINE_TARGET_USER_ID = "U1";
    process.env.APP_URL = "https://feed.example.com";
    pushMock.mockRejectedValue(new Error("LINE push failed with HTTP 500."));
    const { client, jobUpdates } = createClient();
    supabaseHolder.client = client;

    const result = await generateDailyDigest(new Date("2026-11-14T14:00:00Z"));

    expect(result.lineNotified).toBe(false);
    expect(result.warning).toBe("LINE push failed with HTTP 500.");
    const final = jobUpdates.at(-1)!;
    expect(final.status).toBe("partial");
    expect(final.error_message).toBe("LINE push failed with HTTP 500.");
  });

  it("is succeeded with lineNotified when the push works", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "token";
    process.env.LINE_TARGET_USER_ID = "U1";
    process.env.APP_URL = "https://feed.example.com";
    pushMock.mockResolvedValue(undefined);
    const { client, jobUpdates } = createClient();
    supabaseHolder.client = client;

    const result = await generateDailyDigest(new Date("2026-11-14T14:00:00Z"));

    expect(result.lineNotified).toBe(true);
    expect(jobUpdates.at(-1)!.status).toBe("succeeded");
  });
});
