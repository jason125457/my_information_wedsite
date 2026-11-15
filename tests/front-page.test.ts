import { describe, expect, it } from "vitest";

import {
  FRONT_PAGE_LIMIT,
  FRONT_PAGE_MINIMUM,
  FRONT_PAGE_WINDOW_HOURS,
  selectFrontPage,
} from "@/lib/feed/front-page";

const topics = ["ai", "tech", "world", "music", "photo", "finance", "security"];

/** Rows already sorted best-first, cycling through the given topics. */
function rows(prefix: string, count: number, topicList = topics) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    primary_topic_id: topicList[i % topicList.length]!,
  }));
}

describe("front page selection", () => {
  it("shows the top 20 of the last 24 hours", () => {
    expect(FRONT_PAGE_WINDOW_HOURS).toBe(24);
    expect(FRONT_PAGE_LIMIT).toBe(20);

    const recent = rows("recent", 30);
    const page = selectFrontPage(recent, rows("old", 30));

    expect(page).toHaveLength(20);
    expect(page.map((row) => row.id)).toEqual(recent.slice(0, 20).map((row) => row.id));
  });

  it("keeps score order but caps any topic at a quarter of the page", () => {
    const recent = [...rows("ai", 10, ["ai"]), ...rows("mixed", 30, ["tech", "world", "music", "photo"])];
    const page = selectFrontPage(recent);

    expect(page).toHaveLength(20);
    expect(page.filter((row) => row.primary_topic_id === "ai")).toHaveLength(5);
    expect(page.slice(0, 5).every((row) => row.primary_topic_id === "ai")).toBe(true);
  });

  it("tops up a thin day with older best stories, after the recent ones", () => {
    const recent = rows("recent", 4);
    const page = selectFrontPage(recent, [...recent, ...rows("old", 30)]);

    expect(page).toHaveLength(20);
    expect(page.slice(0, 4).map((row) => row.id)).toEqual(recent.map((row) => row.id));
    expect(new Set(page.map((row) => row.id)).size).toBe(20);
  });

  it("does not top up once the recent window reaches the minimum", () => {
    const recent = rows("recent", FRONT_PAGE_MINIMUM);
    const page = selectFrontPage(recent, rows("old", 30));

    expect(page.map((row) => row.id)).toEqual(recent.map((row) => row.id));
  });
});
