import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isAllowedEmail,
  normalizeEmail,
  safeNextPath,
} from "@/lib/auth/authorization";

describe("single-user authorization", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes case and surrounding whitespace", () => {
    expect(normalizeEmail("  Owner@Example.COM ")).toBe("owner@example.com");
  });

  it("accepts only the configured email", () => {
    vi.stubEnv("ALLOWED_EMAIL", "owner@example.com");

    expect(isAllowedEmail("Owner@Example.com")).toBe(true);
    expect(isAllowedEmail("someone@example.com")).toBe(false);
  });

  it("fails closed when ALLOWED_EMAIL is missing", () => {
    vi.stubEnv("ALLOWED_EMAIL", "");
    expect(isAllowedEmail("owner@example.com")).toBe(false);
  });

  it("allows only same-origin relative callback paths", () => {
    expect(safeNextPath("/saved?topic=ai")).toBe("/saved?topic=ai");
    expect(safeNextPath("https://attacker.example")).toBe("/");
    expect(safeNextPath("//attacker.example")).toBe("/");
    expect(safeNextPath("/\\attacker.example")).toBe("/");
    expect(safeNextPath("/saved\r\nLocation: https://attacker.example")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
