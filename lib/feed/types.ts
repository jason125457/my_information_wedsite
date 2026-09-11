export const topicFilters = [
  { slug: "all", label: "For You" },
  { slug: "ai", label: "AI" },
  { slug: "cybersecurity", label: "Cybersecurity" },
  { slug: "technology", label: "Technology" },
  { slug: "finance", label: "Finance" },
  { slug: "world", label: "World" },
  { slug: "music", label: "Music" },
  { slug: "photography", label: "Photography" },
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
  isRead: boolean;
  isSaved: boolean;
  isReadLater: boolean;
  isNotInterested: boolean;
}
