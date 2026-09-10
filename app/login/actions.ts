"use server";

import { redirect } from "next/navigation";

import { isAllowedEmail, normalizeEmail } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

function loginUrl(key: "error" | "sent", value = "1") {
  const parameters = new URLSearchParams({ [key]: value });
  return `/login?${parameters.toString()}`;
}

export async function requestMagicLink(formData: FormData) {
  const value = formData.get("email");
  const email = typeof value === "string" ? normalizeEmail(value) : "";

  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    redirect(loginUrl("error", "configuration"));
  }

  if (!isAllowedEmail(email)) {
    redirect(loginUrl("sent"));
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: new URL("/auth/callback", appUrl).toString(),
        shouldCreateUser: false,
      },
    });

    if (error) {
      console.error("Supabase rejected a Magic Link request.");
    }
  } catch {
    console.error("Magic Link delivery failed because authentication is not configured correctly.");
  }

  redirect(loginUrl("sent"));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
