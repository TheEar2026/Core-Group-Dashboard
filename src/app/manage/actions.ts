"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { ok: boolean; message: string } | undefined;

function toBigint(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function createSchoolAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const name = String(formData.get("school_name") ?? "").trim();
  const { error } = await supabase.rpc("admin_create_school", {
    p_school_name: name,
    p_drived_core_id: toBigint(formData.get("drived_core_id")),
    p_notes: null,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/manage");
  return { ok: true, message: `School "${name}" created.` };
}

export async function createTeacherAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const first = String(formData.get("first_name") ?? "").trim();
  const surname = String(formData.get("surname") ?? "").trim();
  const { error } = await supabase.rpc("admin_create_teacher", {
    p_first_name: first,
    p_surname: surname,
    p_primary_email: String(formData.get("primary_email") ?? "").trim() || null,
    p_school_id: toBigint(formData.get("school_id")),
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/manage");
  return { ok: true, message: `Teacher "${first} ${surname}" created.` };
}

export async function assignSchoolAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const personId = toBigint(formData.get("person_id"));
  if (personId === null) return { ok: false, message: "Please choose a teacher." };
  const { error } = await supabase.rpc("admin_assign_teacher_school", {
    p_person_id: personId,
    p_school_id: toBigint(formData.get("school_id")),
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/manage");
  return { ok: true, message: "Teacher's school updated." };
}

export async function assignCourseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const personId = toBigint(formData.get("person_id"));
  const schoolId = toBigint(formData.get("school_id"));
  if (personId === null) return { ok: false, message: "Please choose a teacher." };
  if (schoolId === null) return { ok: false, message: "Please choose a school." };
  const { error } = await supabase.rpc("admin_assign_course", {
    p_person_id: personId,
    p_school_id: schoolId,
    p_grade: String(formData.get("grade") ?? "").trim(),
    p_course_title: String(formData.get("course_title") ?? "").trim(),
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/manage");
  return { ok: true, message: "Course assigned." };
}
