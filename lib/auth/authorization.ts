export function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase("en-US");
}

export function isAllowedEmail(
  email: string | null | undefined,
  allowedEmail = process.env.ALLOWED_EMAIL,
) {
  if (!email || !allowedEmail) {
    return false;
  }

  return normalizeEmail(email) === normalizeEmail(allowedEmail);
}

export function safeNextPath(value: string | null) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("\r") ||
    value.includes("\n")
  ) {
    return "/";
  }

  return value;
}
