import { describe, expect, it } from "vitest";

import { weekWindow } from "@/lib/weekly/window";

describe("weekly review window", () => {
  it("covers the seven Taipei days ending on the review date", () => {
    expect(weekWindow("2026-10-25")).toEqual({
      start: "2026-10-18T16:00:00.000Z",
      end: "2026-10-25T16:00:00.000Z",
    });
  });
});
