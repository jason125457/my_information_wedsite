import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page reads fresh data from Supabase, so no incremental cache (R2) is
// configured. R2 would require a payment method on the Cloudflare account.
export default defineCloudflareConfig();
