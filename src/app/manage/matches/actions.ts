"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type BulkState = { ok: boolean; message: string } | undefined;

export async function createTeacherFromQueue(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const queueId = Number(formData.get("queue_id"));
  const { error } = await supabase.rpc("admin_match_create_teacher", { p_queue_id: queueId });
  if (error) throw new Error(`admin_match_create_teacher: ${error.message}`);
  revalidatePath("/manage/matches");
}

export async function linkQueueToExisting(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const queueId = Number(formData.get("queue_id"));
  const personId = Number(formData.get("person_id"));
  if (Number.isFinite(queueId) && Number.isFinite(personId)) {
    const { error } = await supabase.rpc("admin_match_link_existing", {
      p_queue_id: queueId,
      p_person_id: personId,
    });
    if (error) throw new Error(`admin_match_link_existing: ${error.message}`);
    revalidatePath("/manage/matches");
  }
}

export async function createAllPending(_prev: BulkState): Promise<BulkState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_match_create_all");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/manage/matches");
  return { ok: true, message: `Created ${data ?? 0} teacher${data === 1 ? "" : "s"}.` };
}

export async function backfillPfSchools(_prev: BulkState): Promise<BulkState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_backfill_pf_schools");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/manage/matches");
  return { ok: true, message: `Updated ${data ?? 0} Product Fruits activity row(s).` };
}
