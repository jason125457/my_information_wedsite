export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        { id: string; email: string; line_user_id: string | null; created_at: string },
        { id: string; email: string; line_user_id?: string | null; created_at?: string },
        { email?: string; line_user_id?: string | null }
      >;
      topics: Table<
        { id: string; slug: string; name: string; default_weight: number },
        { id?: string; slug: string; name: string; default_weight: number }
      >;
      topic_preferences: Table<
        { profile_id: string; topic_id: string; weight: number },
        { profile_id: string; topic_id: string; weight: number }
      >;
      sources: Table<
        {
          id: string;
          name: string;
          type: string;
          url: string;
          reliability_type: string;
          primary_topic_id: string | null;
          is_discovery: boolean;
          is_active: boolean;
          config: Json;
          created_at: string;
        },
        {
          id?: string;
          name: string;
          type: string;
          url: string;
          reliability_type: string;
          primary_topic_id?: string | null;
          is_discovery?: boolean;
          is_active?: boolean;
          config?: Json;
          created_at?: string;
        }
      >;
      raw_items: Table<
        {
          id: string;
          source_id: string;
          external_id: string | null;
          url: string;
          canonical_url: string;
          title: string;
          excerpt: string | null;
          published_at: string | null;
          fetched_at: string;
          raw_metadata: Json;
        },
        {
          id?: string;
          source_id: string;
          external_id?: string | null;
          url: string;
          canonical_url: string;
          title: string;
          excerpt?: string | null;
          published_at?: string | null;
          fetched_at?: string;
          raw_metadata?: Json;
        }
      >;
      stories: Table<
        {
          id: string;
          title: string;
          summary: string;
          why_recommended: string;
          primary_topic_id: string;
          content_type: "current" | "discovery";
          interest_relevance: number;
          information_value: number;
          importance: number;
          freshness: number;
          discussion_popularity: number;
          discovery_value: number;
          final_score: number;
          primary_url: string;
          published_at: string | null;
          created_at: string;
        },
        {
          id?: string;
          title: string;
          summary: string;
          why_recommended: string;
          primary_topic_id: string;
          content_type: "current" | "discovery";
          interest_relevance: number;
          information_value: number;
          importance: number;
          freshness: number;
          discussion_popularity: number;
          discovery_value: number;
          final_score: number;
          primary_url: string;
          published_at?: string | null;
          created_at?: string;
        }
      >;
      story_sources: Table<
        { story_id: string; raw_item_id: string; is_primary: boolean },
        { story_id: string; raw_item_id: string; is_primary?: boolean }
      >;
      story_state: Table<
        {
          profile_id: string;
          story_id: string;
          is_read: boolean;
          is_saved: boolean;
          is_read_later: boolean;
          is_not_interested: boolean;
          feedback_reason: FeedbackReason | null;
          read_at: string | null;
          saved_at: string | null;
          read_later_at: string | null;
          updated_at: string;
        },
        {
          profile_id: string;
          story_id: string;
          is_read?: boolean;
          is_saved?: boolean;
          is_read_later?: boolean;
          is_not_interested?: boolean;
          feedback_reason?: FeedbackReason | null;
          read_at?: string | null;
          saved_at?: string | null;
          read_later_at?: string | null;
          updated_at?: string;
        }
      >;
      tags: Table<{ id: string; name: string }, { id?: string; name: string }>;
      story_tags: Table<
        { story_id: string; tag_id: string },
        { story_id: string; tag_id: string }
      >;
      digests: Table<
        {
          id: string;
          type: "daily" | "weekly";
          date: string;
          title: string;
          summary: string;
          created_at: string;
        },
        {
          id?: string;
          type: "daily" | "weekly";
          date: string;
          title: string;
          summary: string;
          created_at?: string;
        }
      >;
      digest_stories: Table<
        { digest_id: string; story_id: string; position: number },
        { digest_id: string; story_id: string; position: number }
      >;
      job_runs: Table<
        {
          id: string;
          job_type: string;
          started_at: string;
          finished_at: string | null;
          status: JobStatus;
          items_processed: number;
          error_message: string | null;
          metadata: Json;
        },
        {
          id?: string;
          job_type: string;
          started_at?: string;
          finished_at?: string | null;
          status: JobStatus;
          items_processed?: number;
          error_message?: string | null;
          metadata?: Json;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      is_current_profile: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

type FeedbackReason =
  | "topic_not_interesting"
  | "low_value_or_gossip"
  | "too_technical"
  | "already_knew"
  | "poor_source"
  | "do_not_recommend_type";

type JobStatus = "running" | "succeeded" | "partial" | "failed";
