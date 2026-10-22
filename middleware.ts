import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

// Kept as edge `middleware.ts` rather than Next 16's Node.js `proxy.ts`:
// OpenNext on Cloudflare fully supports edge middleware, while Node.js
// middleware is experimental there. It only refreshes the Supabase session.
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
