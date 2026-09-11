import { notFound } from "next/navigation";

import { FeedPage } from "@/components/feed/feed-page";
import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { loadDailyDigestStories } from "@/lib/digest/load";

export const dynamic = "force-dynamic";

export default async function DailyDigestPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const { supabase, user } = await requireAuthenticatedUser();
  const digest = await loadDailyDigestStories(supabase, user.id, date);
  if (!digest) notFound();
  return <FeedPage email={user.email} stories={digest.stories} eyebrow="Daily Digest" heading={digest.title} />;
}
