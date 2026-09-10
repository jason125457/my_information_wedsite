"use server";

import { redirect } from "next/navigation";

import { isAllowedEmail, normalizeEmail } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

function loginUrl(key: "error" | "sent", value: string) {
  const parameters = new URLSearchParams({ [key]: value });
  return `/login?${parameters.toString()}`;
}

export async function requestMagicLink(formData: FormData) {
  const value = formData.get("email");
  const email = typeof value === "string" ? normalizeEmail(value) : "";

  if (!isAllowedEmail(email)) {
    redirect(loginUrl("error", "not-allowed"));
  }

  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    redirect(loginUrl("error", "configuration"));
  }

  let failed = false;

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: new URL("/auth/callback", appUrl).toString(),
        shouldCreateUser: false,
      },
    });

    failed = Boolean(error);
  } catch {
    redirect(loginUrl("error", "configuration"));
  }

  if (failed) {
    redirect(loginUrl("error", "send-failed"));
  }

  redirect(loginUrl("sent", email));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
