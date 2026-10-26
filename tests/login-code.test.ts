import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { LOGIN_CODE_LENGTH, parseLoginCode } from "@/lib/auth/login-code";

describe("parseLoginCode", () => {
  it("accepts exactly six digits", () => {
    expect(parseLoginCode("123456")).toBe("123456");
  });

  it("tolerates spaces, dashes, and full-width digits from pasting or IMEs", () => {
    expect(parseLoginCode(" 123 456 ")).toBe("123456");
    expect(parseLoginCode("123-456")).toBe("123456");
    expect(parseLoginCode("１２３４５６")).toBe("123456");
  });

  it("rejects wrong lengths, letters, and non-strings", () => {
    expect(parseLoginCode("12345")).toBeNull();
    expect(parseLoginCode("12345678")).toBeNull();
    expect(parseLoginCode("12a456")).toBeNull();
    expect(parseLoginCode("")).toBeNull();
    expect(parseLoginCode(null)).toBeNull();
  });
});

describe("Supabase email configuration", () => {
  const config = readFileSync("supabase/config.toml", "utf8");
  const template = readFileSync("supabase/templates/magic-link.html", "utf8");

  it("issues codes of the length the login form expects", () => {
    expect(config).toMatch(new RegExp(`^otp_length = ${LOGIN_CODE_LENGTH}$`, "m"));
  });

  it("sends both the link and the code in the magic-link email", () => {
    expect(config).toContain('content_path = "./supabase/templates/magic-link.html"');
    expect(template).toContain("{{ .ConfirmationURL }}");
    expect(template).toContain("{{ .Token }}");
  });
});
