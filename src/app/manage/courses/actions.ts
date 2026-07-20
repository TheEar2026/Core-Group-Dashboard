"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionState = { ok: boolean; message: string } | undefined;

export async function createCourseAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const grade = String(form.get("grade") ?? "");
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { ok: false, message: "Course title is required." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_course", { p_grade: grade, p_title: title });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/manage/courses");
  return { ok: true, message: `Created “${title}”.` };
}

export async function createModuleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const courseId = Number(form.get("courseId"));
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { ok: false, message: "Module title is required." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_add_module", { p_course_id: courseId, p_title: title });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/manage/courses/${courseId}`);
  return { ok: true, message: `Created “${title}”.` };
}

export async function addLessonAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const moduleId = Number(form.get("moduleId"));
  const courseId = Number(form.get("courseId"));
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { ok: false, message: "Lesson title is required." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_add_lesson", { p_module_id: moduleId, p_title: title });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/manage/courses/${courseId}/modules/${moduleId}`);
  return { ok: true, message: `Added “${title}”.` };
}

export async function assignTeacherAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const courseId = Number(form.get("courseId"));
  const personId = Number(form.get("personId"));
  if (!personId) return { ok: false, message: "Pick a teacher." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_assign_catalog_course", { p_person_id: personId, p_course_id: courseId });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/manage/courses/${courseId}`);
  return { ok: true, message: "Teacher assigned." };
}

export async function unassignTeacherAction(courseId: number, personId: number): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_unassign_catalog_course", { p_person_id: personId, p_course_id: courseId });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/manage/courses/${courseId}`);
  return { ok: true, message: "Teacher removed." };
}

export async function createTeacherLoginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const personId = Number(form.get("personId"));
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!personId) return { ok: false, message: "Pick a teacher." };
  if (!email) return { ok: false, message: "Email is required." };
  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };

  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      message:
        "Teacher logins need SUPABASE_SERVICE_ROLE_KEY set on the server. Add it in Vercel → Settings → Environment Variables, then redeploy.",
    };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) return { ok: false, message: error.message };
  const authUserId = data.user?.id;
  if (!authUserId) return { ok: false, message: "Auth user was not created." };

  // Link the new login to the person (super-admin session authorises the RPC).
  const supabase = await createClient();
  const { error: linkErr } = await supabase.rpc("admin_link_teacher_login", {
    p_person_id: personId,
    p_auth_user_id: authUserId,
  });
  if (linkErr) return { ok: false, message: `Login created but linking failed: ${linkErr.message}` };

  revalidatePath("/manage/logins");
  return { ok: true, message: `Login created for ${email}. Share the temporary password with them.` };
}
