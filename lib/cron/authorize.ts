import { timingSafeEqual } from "node:crypto";

export function isAuthorizedCronRequest(request: Request, secret = process.env.CRON_SECRET) {
  if (!secret) return false;
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  return safeEqual(authorization.slice(7), secret);
}

function safeEqual(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}
