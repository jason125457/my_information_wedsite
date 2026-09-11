import { describe, expect, it } from "vitest";

import { feedbackReasonSchema, storyIdSchema } from "@/lib/feed/state";

describe("feed state input validation", () => {
  it("accepts database story UUIDs and rejects arbitrary identifiers", () => {
    expect(storyIdSchema.safeParse("40000000-0000-4000-8000-000000000001").success).toBe(true);
    expect(storyIdSchema.safeParse("../../other-story").success).toBe(false);
  });

  it("accepts only the documented feedback reasons", () => {
    expect(feedbackReasonSchema.safeParse("too_technical").success).toBe(true);
    expect(feedbackReasonSchema.safeParse("hide_everything").success).toBe(false);
  });
});
