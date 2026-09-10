export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Row<T> = T;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Row<{
          id: string;
          email: string;
          line_user_id: string | null;
          created_at: string;
        }>;
        Insert: {
          id: string;
          email: string;
          line_user_id?: string | null;
          created_at?: string;
        };
        Update: {
          email?: string;
          line_user_id?: string | null;
        };
        Relationships: [];
      };
      topics: {
        Row: Row<{
          id: string;
          slug: string;
          name: string;
          default_weight: number;
        }>;
        Insert: {
          id?: string;
          slug: string;
          name: string;
          default_weight: number;
        };
        Update: {
          slug?: string;
          name?: string;
          default_weight?: number;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
