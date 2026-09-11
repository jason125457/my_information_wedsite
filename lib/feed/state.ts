import { z } from "zod";

export const storyIdSchema = z.string().uuid();
export const feedbackReasonSchema = z.enum([
  "topic_not_interesting",
  "low_value_or_gossip",
  "too_technical",
  "already_knew",
  "poor_source",
  "do_not_recommend_type",
]);

export type FeedbackReason = z.infer<typeof feedbackReasonSchema>;

export const feedbackReasons: Array<{ value: FeedbackReason; label: string }> = [
  { value: "topic_not_interesting", label: "Topic not interesting" },
  { value: "low_value_or_gossip", label: "Low value or gossip" },
  { value: "too_technical", label: "Too technical" },
  { value: "already_knew", label: "Already knew this" },
  { value: "poor_source", label: "Poor source" },
  { value: "do_not_recommend_type", label: "Do not recommend this type" },
];
