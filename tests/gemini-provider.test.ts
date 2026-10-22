import { ApiError } from "@google/genai";
import { describe, expect, it } from "vitest";

import { GeminiDailyQuotaError, retryDelayFor } from "@/lib/ai/provider";

describe("Gemini retry policy", () => {
  it("waits for the server-suggested delay on a per-minute rate limit", () => {
    const error = new ApiError({
      status: 429,
      message: 'Quota exceeded for GenerateRequestsPerMinute. Please retry in 37.5s. "retryDelay": "37s"',
    });
    expect(retryDelayFor(error, 0)).toBe(38_500);
  });

  it("backs off when no delay is suggested", () => {
    const error = new ApiError({ status: 429, message: "Resource exhausted." });
    expect(retryDelayFor(error, 1)).toBe(60_000);
  });

  it("fails fast once the daily quota is exhausted", () => {
    const error = new ApiError({
      status: 429,
      message: "Quota exceeded for metric: GenerateRequestsPerDayPerProjectPerModel-FreeTier",
    });
    expect(() => retryDelayFor(error, 0)).toThrow(GeminiDailyQuotaError);
  });

  it("retries server errors but not client errors", () => {
    expect(retryDelayFor(new ApiError({ status: 503, message: "Overloaded" }), 0)).toBe(10_000);
    expect(retryDelayFor(new ApiError({ status: 400, message: "Bad schema" }), 0)).toBeNull();
    expect(retryDelayFor(new Error("network"), 0)).toBeNull();
  });
});
