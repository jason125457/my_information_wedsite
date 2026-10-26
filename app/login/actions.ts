"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isAllowedEmail, normalizeEmail } from "@/lib/auth/authorization";
import { completeSignIn } from "@/lib/auth/complete-sign-in";
import {
  LOGIN_EMAIL_COOKIE,
  LOGIN_EMAIL_COOKIE_MAX_AGE,
  parseLoginCode,
} from "@/lib/auth/login-code";
import { createClient } from "@/lib/supabase/server";

function loginUrl(key: "error" | "sent", value = "1") {
  const parameters = new URLSearchParams({ [key]: value });
  return `/login?${parameters.toString()}`;
}

/** Errors on the code form keep the "sent" view so the code field stays on screen. */
function codeErrorUrl(error: string) {
  return `/login?sent=1&error=${error}`;
}

export async function requestMagicLink(formData: FormData) {
  const value = formData.get("email");
  const email = typeof value === "string" ? normalizeEmail(value) : "";

  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    redirect(loginUrl("error", "configuration"));
  }

  // Remembered for every request, allowed or not, so the response never reveals which email works.
  const cookieStore = await cookies();
  cookieStore.set(LOGIN_EMAIL_COOKIE, email, {
    httpOnly: true,
    secure: appUrl.startsWith("https://"),
    sameSite: "lax",
    path: "/login",
    maxAge: LOGIN_EMAIL_COOKIE_MAX_AGE,
  });

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
      // The page still says "sent" so it never reveals which emails are allowed,
      // but the reason is logged (e.g. the allowed user was never created in
      // Supabase Auth, which rejects the request because signups are disabled).
      console.error("Supabase rejected a Magic Link request.", {
        status: error.status,
        code: error.code,
        message: error.message,
      });
    }
  } catch {
    console.error("Magic Link delivery failed because authentication is not configured correctly.");
  }

  redirect(loginUrl("sent"));
}

/**
 * Signs in with the one-time code from the email. This is the path that works in the iPhone
 * home-screen app: the session is created in the app itself, while email links open in Safari.
 */
export async function verifyLoginCode(formData: FormData) {
  const cookieStore = await cookies();
  const email = normalizeEmail(cookieStore.get(LOGIN_EMAIL_COOKIE)?.value ?? "");
  if (!email) {
    redirect(loginUrl("error", "code-expired"));
  }

  const token = parseLoginCode(formData.get("code"));
  if (!token) {
    redirect(codeErrorUrl("code-format"));
  }

  // Same answer as a wrong code, so the form never confirms which email is allowed.
  if (!isAllowedEmail(email)) {
    redirect(codeErrorUrl("code"));
  }

  // redirect() throws, so the outcome is decided inside try and acted on after it.
  let outcome: "ok" | "code" | "not-allowed" | "configuration";
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    outcome = error ? "code" : await completeSignIn(supabase, data.user);
  } catch {
    outcome = "configuration";
  }

  if (outcome === "code") {
    redirect(codeErrorUrl("code"));
  }
  if (outcome !== "ok") {
    redirect(loginUrl("error", outcome));
  }

  cookieStore.delete({ name: LOGIN_EMAIL_COOKIE, path: "/login" });
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
