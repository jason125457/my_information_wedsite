import { FeedPage } from "@/components/feed/feed-page";
import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { loadFeed } from "@/lib/feed/load-feed";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const { supabase, user } = await requireAuthenticatedUser();
  const stories = await loadFeed(supabase, user.id, "history");
  return <FeedPage email={user.email} stories={stories} view="history" eyebrow="History" heading="What you’ve already opened" />;
}
