import { NextResponse, type NextRequest } from "next/server";

import {
  isAllowedEmail,
  normalizeEmail,
  safeNextPath,
} from "@/lib/auth/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
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

    if (error || !data.user || !isAllowedEmail(data.user.email)) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=not-allowed", url.origin));
    }

    const admin = createAdminClient();
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: data.user.id,
        email: normalizeEmail(data.user.email!),
      },
      { onConflict: "id" },
    );

    if (profileError) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=configuration", url.origin));
    }

    return NextResponse.redirect(new URL(next, url.origin));
  } catch {
    return NextResponse.redirect(new URL("/login?error=configuration", url.origin));
  }
}
