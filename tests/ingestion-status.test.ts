import { describe, expect, it } from "vitest";

import { ingestionStatus } from "@/lib/pipeline/ingest";

const stat = (sourceId: string, error: string | null = null) => ({
  sourceId,
  sourceName: `Source ${sourceId}`,
  error,
});

describe("ingestionStatus", () => {
  it("succeeds when no source failed, even with nothing new", () => {
    expect(ingestionStatus([stat("a"), stat("b")], new Set(["a", "b"]))).toEqual({
      status: "succeeded",
    });
  });

  it("is partial when only some attempted sources failed", () => {
    const result = ingestionStatus([stat("a"), stat("b", "HTTP 404")], new Set(["a", "b"]));
    expect(result.status).toBe("partial");
    expect(result.errorMessage).toBe("1/2 sources failed: Source b (HTTP 404)");
  });

  it("is failed when every attempted source failed", () => {
    const result = ingestionStatus(
      [stat("a", "HTTP 503"), stat("b", "fetch failed")],
      new Set(["a", "b"]),
    );
    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("2/2 sources failed");
  });

  it("ignores sources that were not attempted this run", () => {
    // "c" was rotated out: no error and not attempted, so it is not a success either.
    const result = ingestionStatus([stat("a", "HTTP 404"), stat("c")], new Set(["a"]));
    expect(result.status).toBe("failed");
  });

  it("keeps the message short", () => {
    const many = Array.from({ length: 50 }, (_, index) => stat(String(index), "x".repeat(80)));
    const result = ingestionStatus(many, new Set(many.map((item) => item.sourceId)));
    expect(result.errorMessage!.length).toBeLessThanOrEqual(1_000);
  });
});
