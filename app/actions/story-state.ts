"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAllowedEmail } from "@/lib/auth/authorization";
import { feedbackReasonSchema, storyIdSchema, type FeedbackReason } from "@/lib/feed/state";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export interface StoryActionResult {
  ok: boolean;
  message?: string;
}

export async function markStoryRead(storyId: string): Promise<StoryActionResult> {
  return updateStoryState(storyId, {
    is_read: true,
    read_at: new Date().toISOString(),
  });
}

export async function setStorySaved(
  storyId: string,
  isSaved: boolean,
): Promise<StoryActionResult> {
  const parsedState = z.boolean().safeParse(isSaved);
  if (!parsedState.success) return { ok: false, message: "Invalid saved state." };
  return updateStoryState(storyId, {
    is_saved: parsedState.data,
    saved_at: parsedState.data ? new Date().toISOString() : null,
  });
}

export async function setStoryReadLater(
  storyId: string,
  isReadLater: boolean,
): Promise<StoryActionResult> {
  const parsedState = z.boolean().safeParse(isReadLater);
  if (!parsedState.success) return { ok: false, message: "Invalid read-later state." };
  return updateStoryState(storyId, {
    is_read_later: parsedState.data,
    read_later_at: parsedState.data ? new Date().toISOString() : null,
  });
}

export async function markStoryNotInterested(
  storyId: string,
  feedbackReason: FeedbackReason,
): Promise<StoryActionResult> {
  const parsedReason = feedbackReasonSchema.safeParse(feedbackReason);
  if (!parsedReason.success) return { ok: false, message: "Choose a valid feedback reason." };
  return updateStoryState(storyId, {
    is_not_interested: true,
    feedback_reason: parsedReason.data,
  });
}

type StoryStateInsert = Database["public"]["Tables"]["story_state"]["Insert"];
type StoryStatePatch = Partial<
  Pick<
    StoryStateInsert,
    | "is_read"
    | "is_saved"
    | "is_read_later"
    | "is_not_interested"
    | "feedback_reason"
    | "read_at"
    | "saved_at"
    | "read_later_at"
  >
>;

async function updateStoryState(
  storyId: string,
  values: StoryStatePatch,
): Promise<StoryActionResult> {
  const parsedId = storyIdSchema.safeParse(storyId);
  if (!parsedId.success) return { ok: false, message: "Invalid story." };

  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user || !isAllowedEmail(data.user.email)) {
    return { ok: false, message: "Your session has expired. Sign in again." };
  }

  const state: StoryStateInsert = {
    profile_id: data.user.id,
    story_id: parsedId.data,
    updated_at: new Date().toISOString(),
    ...values,
  };
  const { error } = await supabase.from("story_state").upsert(
    state,
    { onConflict: "profile_id,story_id" },
  );

  if (error) {
    console.error("Story state update failed", { code: error.code });
    return { ok: false, message: "Could not save this change. Try again." };
  }

  revalidatePath("/");
  revalidatePath("/saved");
  revalidatePath("/read-later");
  revalidatePath("/history");
  return { ok: true };
}
