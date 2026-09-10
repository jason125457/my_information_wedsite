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
  publishedAt: string;
  publishedLabel: string;
  topic: Exclude<TopicSlug, "all">;
  topicLabel: string;
  contentType: "Current" | "Discovery";
  primaryUrl: string;
  isRead: boolean;
}

export const mockStories: FeedStory[] = [
  {
    id: "hello-gpt-4o",
    title: "Hello GPT-4o",
    summary:
      "OpenAI introduced GPT-4o as a model designed to work across text, audio, image, and video inputs. The announcement includes demonstrations, evaluations, and links to the accompanying system card.",
    whyRecommended:
      "A useful primary-source reference for how multimodal AI products began moving toward real-time interaction.",
    source: "OpenAI",
    publishedAt: "2024-05-13",
    publishedLabel: "May 13, 2024",
    topic: "ai",
    topicLabel: "AI / LLM",
    contentType: "Discovery",
    primaryUrl: "https://openai.com/index/hello-gpt-4o/",
    isRead: false,
  },
  {
    id: "next-15",
    title: "Next.js 15",
    summary:
      "The Next.js team announced version 15 with React 19 support, stable Turbopack development, and changed caching defaults. The release notes collect the framework changes and migration details in one place.",
    whyRecommended:
      "This is a concise official overview of changes that shaped modern App Router projects.",
    source: "Next.js",
    publishedAt: "2024-10-21",
    publishedLabel: "October 21, 2024",
    topic: "technology",
    topicLabel: "Technology",
    contentType: "Discovery",
    primaryUrl: "https://nextjs.org/blog/next-15",
    isRead: false,
  },
  {
    id: "apple-intelligence",
    title: "Introducing Apple Intelligence for iPhone, iPad, and Mac",
    summary:
      "Apple introduced a personal intelligence system integrated with iOS, iPadOS, and macOS. Its announcement outlines language and image features alongside the company’s Private Cloud Compute approach.",
    whyRecommended:
      "It connects a major platform shift with the privacy model Apple chose to emphasize in its official announcement.",
    source: "Apple Newsroom",
    publishedAt: "2024-06-10",
    publishedLabel: "June 10, 2024",
    topic: "technology",
    topicLabel: "Technology",
    contentType: "Discovery",
    primaryUrl:
      "https://www.apple.com/uk/newsroom/2024/06/introducing-apple-intelligence-for-iphone-ipad-and-mac/",
    isRead: true,
  },
  {
    id: "everything-is-alive",
    title: "everything is alive",
    summary:
      "Slowdive’s fifth album pairs the band’s familiar shoegaze language with a brighter sense of movement and renewal. The Bandcamp page offers the complete track list, credits, and direct listening options.",
    whyRecommended:
      "A strong discovery pick when you want atmospheric guitar music without chasing whatever is newest today.",
    source: "Slowdive on Bandcamp",
    publishedAt: "2023-09-01",
    publishedLabel: "September 1, 2023",
    topic: "music",
    topicLabel: "Music",
    contentType: "Discovery",
    primaryUrl: "https://slowdive.bandcamp.com/album/everything-is-alive",
    isRead: false,
  },
];
