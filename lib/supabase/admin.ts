import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseAdminConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";

export function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
