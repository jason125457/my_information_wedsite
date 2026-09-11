import "server-only";

import { redirect } from "next/navigation";

import { isAllowedEmail } from "@/lib/auth/authorization";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function requireAuthenticatedUser() {
  if (!isSupabaseConfigured()) redirect("/login?error=configuration");

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  if (!isAllowedEmail(data.user.email)) {
    await supabase.auth.signOut();
    redirect("/login?error=not-allowed");
  }

  return { supabase, user: data.user };
}

export async function getOptionalAuthenticatedUser() {
  if (!isSupabaseConfigured()) redirect("/login?error=configuration");

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { supabase, user: null };
  if (isAllowedEmail(data.user.email)) return { supabase, user: data.user };

  await supabase.auth.signOut();
  return { supabase, user: null };
}
