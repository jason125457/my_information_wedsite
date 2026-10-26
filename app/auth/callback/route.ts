import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/authorization";
import { completeSignIn } from "@/lib/auth/complete-sign-in";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=callback", url.origin));
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    // A failed exchange usually means the link was opened in a different browser than the one
    // that asked for it (e.g. the iPhone home-screen app vs Safari), not a wrong email.
    if (error) {
      return NextResponse.redirect(new URL("/login?error=callback", url.origin));
    }

    const result = await completeSignIn(supabase, data.user);
    if (result !== "ok") {
      return NextResponse.redirect(new URL(`/login?error=${result}`, url.origin));
    }

    return NextResponse.redirect(new URL(next, url.origin));
  } catch {
    return NextResponse.redirect(new URL("/login?error=configuration", url.origin));
  }
}
