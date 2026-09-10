const missingConfigurationMessage =
  "Supabase is not configured. Add the required values to .env.local.";

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function getSupabaseBrowserConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(missingConfigurationMessage);
  }

  return { url, anonKey };
}

export function getSupabaseAdminConfig() {
  const { url } = getSupabaseBrowserConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(missingConfigurationMessage);
  }

  return { url, serviceRoleKey };
}
