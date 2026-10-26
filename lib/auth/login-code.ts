export const LOGIN_CODE_LENGTH = 6;

/** Remembers which address a code was sent to, so the code form only asks for the code. */
export const LOGIN_EMAIL_COOKIE = "login_email";
export const LOGIN_EMAIL_COOKIE_MAX_AGE = 60 * 60;

/**
 * Normalizes a typed or pasted one-time code: full-width digits become ASCII and spaces or
 * dashes are dropped. Returns null unless exactly LOGIN_CODE_LENGTH digits remain.
 */
export function parseLoginCode(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const code = value.normalize("NFKC").replace(/[\s-]/g, "");
  return new RegExp(`^[0-9]{${LOGIN_CODE_LENGTH}}$`).test(code) ? code : null;
}
