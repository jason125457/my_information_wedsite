export const topicFilters = [
  { slug: "all", label: "全部" },
  { slug: "ai", label: "AI" },
  { slug: "cybersecurity", label: "資安" },
  { slug: "technology", label: "科技" },
  { slug: "finance", label: "財經" },
  { slug: "world", label: "國際" },
  { slug: "music", label: "音樂" },
  { slug: "photography", label: "攝影" },
] as const;

export type TopicSlug = (typeof topicFilters)[number]["slug"];

export interface FeedStory {
  id: string;
  title: string;
  summary: string;
  whyRecommended: string;
  source: string;
  sourceCount: number;
  publishedAt: string;
  publishedLabel: string;
  topic: Exclude<TopicSlug, "all">;
  topicLabel: string;
  contentType: "Current" | "Discovery";
  primaryUrl: string;
  imageUrl: string | null;
  finalScore: number;
  isRead: boolean;
  isSaved: boolean;
  isReadLater: boolean;
  isNotInterested: boolean;
}
