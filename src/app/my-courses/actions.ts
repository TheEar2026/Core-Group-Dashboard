"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ToggleResult = { ok: boolean; message?: string };

export async function toggleLesson(
  lessonId: number,
  courseId: number,
  completed: boolean,
): Promise<ToggleResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_lesson_complete", {
    p_lesson_id: lessonId,
    p_completed: completed,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/my-courses");
  revalidatePath(`/my-courses/${courseId}`);
  revalidatePath("/my-courses/progress");
  return { ok: true };
}
