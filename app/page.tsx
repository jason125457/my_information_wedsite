import { FeedPage } from "@/components/feed/feed-page";
import { getOptionalAuthenticatedUser } from "@/lib/auth/require-user";
import { loadFeed } from "@/lib/feed/load-feed";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { supabase, user } = await getOptionalAuthenticatedUser();
  const stories = await loadFeed(supabase, user?.id ?? null);
  return <FeedPage email={user?.email} stories={stories} canPersonalize={Boolean(user)} />;
}
