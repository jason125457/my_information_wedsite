"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAllowedEmail } from "@/lib/auth/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface SettingsActionResult {
  ok: boolean;
  message?: string;
}

const idSchema = z.string().uuid();
const weightSchema = z.number().int().min(1).max(5);

async function ownerId() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || !isAllowedEmail(data.user.email)) return { supabase, userId: null };
  return { supabase, userId: data.user.id };
}

/** Per-topic weight (1–5) used by ingestion ranking; stored in topic_preferences (RLS: own rows). */
export async function setTopicWeight(topicId: string, weight: number): Promise<SettingsActionResult> {
  const parsedTopic = idSchema.safeParse(topicId);
  const parsedWeight = weightSchema.safeParse(weight);
  if (!parsedTopic.success || !parsedWeight.success) return { ok: false, message: "無效的主題或權重。" };

  const { supabase, userId } = await ownerId();
  if (!userId) return { ok: false, message: "登入已過期，請重新登入。" };

  const { error } = await supabase
    .from("topic_preferences")
    .upsert({ profile_id: userId, topic_id: parsedTopic.data, weight: parsedWeight.data }, { onConflict: "profile_id,topic_id" });
  if (error) {
    console.error("Topic weight update failed", { code: error.code });
    return { ok: false, message: "無法儲存，請再試一次。" };
  }

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Turns a source on or off for future ingestion runs. Sources are global
 * content tables that only the service role may write, so the owner check
 * happens here before the admin client is used.
 */
export async function setSourceActive(sourceId: string, isActive: boolean): Promise<SettingsActionResult> {
  const parsedSource = idSchema.safeParse(sourceId);
  const parsedActive = z.boolean().safeParse(isActive);
  if (!parsedSource.success || !parsedActive.success) return { ok: false, message: "無效的來源。" };

  const { userId } = await ownerId();
  if (!userId) return { ok: false, message: "登入已過期，請重新登入。" };

  const { error } = await createAdminClient()
    .from("sources")
    .update({ is_active: parsedActive.data })
    .eq("id", parsedSource.data);
  if (error) {
    console.error("Source toggle failed", { code: error.code });
    return { ok: false, message: "無法儲存，請再試一次。" };
  }

  revalidatePath("/settings");
  return { ok: true };
}
