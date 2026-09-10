"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseBrowserConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";

export function createClient() {
  const { url, anonKey } = getSupabaseBrowserConfig();
  return createBrowserClient<Database>(url, anonKey);
}
