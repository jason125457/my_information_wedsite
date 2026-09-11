import { describe, expect, it, vi } from "vitest";

import { isAuthorizedCronRequest } from "@/lib/cron/authorize";
import { selectDailyDigest } from "@/lib/digest/select";
import { sendLineDigestNotification } from "@/lib/line/push";

describe("cron authorization", () => {
  it("accepts only the exact bearer secret", () => {
    expect(
      isAuthorizedCronRequest(
        new Request("https://example.com/api/cron/digest", {
          headers: { Authorization: "Bearer correct-secret" },
        }),
        "correct-secret",
      ),
    ).toBe(true);
    expect(
      isAuthorizedCronRequest(
        new Request("https://example.com/api/cron/digest", {
          headers: { Authorization: "Bearer wrong-secret" },
        }),
        "correct-secret",
      ),
    ).toBe(false);
    expect(isAuthorizedCronRequest(new Request("https://example.com"), "correct-secret")).toBe(false);
  });
});

describe("daily digest selection", () => {
  it("keeps the quality threshold, maximum volume, and discovery target", () => {
    const candidates = [
      ...Array.from({ length: 22 }, (_, index) => ({
        id: `current-${index}`,
        finalScore: 100 - index,
        contentType: "current" as const,
      })),
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `discovery-${index}`,
        finalScore: 70 - index,
        contentType: "discovery" as const,
      })),
      { id: "noise", finalScore: 54, contentType: "discovery" as const },
    ];

    const selected = selectDailyDigest(candidates);

    expect(selected).toHaveLength(20);
    expect(selected.filter((item) => item.contentType === "discovery")).toHaveLength(4);
    expect(selected.every((item) => item.finalScore >= 55)).toBe(true);
  });

  it("does not fill the digest with low-quality items", () => {
    expect(
      selectDailyDigest([
        { id: "worthwhile", finalScore: 80, contentType: "current" },
        { id: "noise", finalScore: 20, contentType: "current" },
      ]),
    ).toEqual([{ id: "worthwhile", finalScore: 80, contentType: "current" }]);
  });
});

describe("LINE digest notification", () => {
  it("sends a notification-only push with a web app link", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await sendLineDigestNotification(
      {
        accessToken: "line-token",
        targetUserId: "U123",
        appUrl: "https://feed.example.com",
        itemCount: 17,
        topicCounts: { AI: 3, Music: 4 },
        retryKey: "40000000-0000-4000-8000-000000000001",
      },
      fetchMock as typeof fetch,
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.line.me/v2/bot/message/push");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer line-token");
    expect(new Headers(init?.headers).get("X-Line-Retry-Key")).toBe(
      "40000000-0000-4000-8000-000000000001",
    );
    expect(String(init?.body)).toContain("今天有 17 則值得你看");
    expect(String(init?.body)).toContain("https://feed.example.com/digest");
  });

  it("does not expose response bodies when LINE rejects a push", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(new Response("sensitive upstream details", { status: 401 }));
    await expect(
      sendLineDigestNotification(
        {
          accessToken: "bad-token",
          targetUserId: "U123",
          appUrl: "https://feed.example.com",
          itemCount: 1,
          topicCounts: {},
        },
        fetchMock as typeof fetch,
      ),
    ).rejects.toThrow("LINE push failed with HTTP 401.");
  });
});
