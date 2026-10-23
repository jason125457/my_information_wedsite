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
  { value: "topic_not_interesting", label: "對這個主題沒興趣" },
  { value: "low_value_or_gossip", label: "太八卦／太廢" },
  { value: "too_technical", label: "太技術" },
  { value: "already_knew", label: "已經知道了" },
  { value: "poor_source", label: "來源品質差" },
  { value: "do_not_recommend_type", label: "不想再看到這類內容" },
];
