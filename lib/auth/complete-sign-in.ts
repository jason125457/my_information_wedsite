import "server-only";

import type { User } from "@supabase/supabase-js";

import { isAllowedEmail, normalizeEmail } from "@/lib/auth/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Shared last step for both sign-in paths (email link and typed code): keep the session only
 * for the allowed user and make sure their profile row exists. Signs out on any failure.
 */
export async function completeSignIn(
  supabase: ServerClient,
  user: User | null,
): Promise<"ok" | "not-allowed" | "configuration"> {
  if (!user || !isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    return "not-allowed";
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .upsert({ id: user.id, email: normalizeEmail(user.email!) }, { onConflict: "id" });

  if (error) {
    await supabase.auth.signOut();
    return "configuration";
  }

  return "ok";
}
