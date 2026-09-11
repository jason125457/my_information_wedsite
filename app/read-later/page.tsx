import { FeedPage } from "@/components/feed/feed-page";
import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { loadFeed } from "@/lib/feed/load-feed";

export const dynamic = "force-dynamic";

export default async function ReadLaterPage() {
  const { supabase, user } = await requireAuthenticatedUser();
  const stories = await loadFeed(supabase, user.id, "read-later");
  return <FeedPage email={user.email} stories={stories} view="read-later" eyebrow="Reading queue" heading="For when you have more time" />;
}
