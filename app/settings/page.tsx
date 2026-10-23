import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { SettingsForm, type SettingsSource, type SettingsTopic } from "@/components/settings/settings-form";
import { requireAuthenticatedUser } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

const topicLabels: Record<string, string> = {
  ai: "AI",
  cybersecurity: "資安",
  technology: "科技",
  finance: "財經",
  world: "國際",
  music: "音樂",
  photography: "攝影",
};

const typeLabels: Record<string, string> = {
  rss: "RSS",
  hacker_news: "Hacker News",
  reddit: "Reddit",
  youtube: "YouTube",
};

export default async function SettingsPage() {
  const { supabase, user } = await requireAuthenticatedUser();
  const [topicResult, preferenceResult, sourceResult] = await Promise.all([
    supabase.from("topics").select("id,slug,name,default_weight"),
    supabase.from("topic_preferences").select("topic_id,weight").eq("profile_id", user.id),
    supabase.from("sources").select("id,name,type,is_active,is_discovery,primary_topic_id").order("name"),
  ]);
  if (topicResult.error) throw new Error(`Unable to load topics: ${topicResult.error.message}`);
  if (sourceResult.error) throw new Error(`Unable to load sources: ${sourceResult.error.message}`);

  const weights = new Map((preferenceResult.data ?? []).map((row) => [row.topic_id, row.weight]));
  const order = Object.keys(topicLabels);
  const topics: SettingsTopic[] = topicResult.data
    .map((topic) => ({
      id: topic.id,
      slug: topic.slug,
      label: topicLabels[topic.slug] ?? topic.name,
      weight: weights.get(topic.id) ?? topic.default_weight,
    }))
    .sort((first, second) => order.indexOf(first.slug) - order.indexOf(second.slug));

  const slugById = new Map(topics.map((topic) => [topic.id, topic.slug]));
  const sources: SettingsSource[] = sourceResult.data.map((source) => ({
    id: source.id,
    name: source.name,
    typeLabel: typeLabels[source.type] ?? source.type,
    topicSlug: (source.primary_topic_id && slugById.get(source.primary_topic_id)) || "technology",
    isActive: source.is_active,
    isDiscovery: source.is_discovery,
  }));

  return (
    <>
      <AppHeader email={user.email} />
      <main className="mx-auto max-w-3xl px-5 sm:px-8">
        <header className="flex flex-col gap-3 border-b-2 border-[var(--ink)] pt-10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">設定</p>
            <h1 className="mt-1 font-serif text-[clamp(32px,5vw,50px)] leading-[1.08] font-semibold tracking-[-0.02em]">
              調整你的資訊來源
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">變更會在下一次抓取（每 2 小時）生效，不影響已經產生的內容。</p>
          </div>
          <Link href="/settings/jobs" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:underline">
            排程紀錄
            <ArrowRight aria-hidden="true" size={15} />
          </Link>
        </header>
        <SettingsForm topics={topics} sources={sources} />
      </main>
    </>
  );
}
