import { FeedPage } from "@/components/feed/feed-page";
import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { loadFeed } from "@/lib/feed/load-feed";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const { supabase, user } = await requireAuthenticatedUser();
  const stories = await loadFeed(supabase, user.id, "saved");
  return <FeedPage email={user.email} stories={stories} view="saved" eyebrow="Knowledge base" heading="Saved for the long term" />;
}
