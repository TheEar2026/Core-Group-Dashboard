"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionState } from "../courses/actions";

const NO_KEY =
  "This needs SUPABASE_SERVICE_ROLE_KEY set on the server (Vercel → Settings → Environment Variables), then a redeploy.";

/** A readable temporary password, e.g. "Ear-8fk2mQ". */
function tempPassword() {
  return "Ear-" + randomBytes(6).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
}

// ---------- School-admin login ----------

export async function createSchoolAdminAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const schoolId = Number(form.get("schoolId"));
  if (!email) return { ok: false, message: "Email is required." };
  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  if (!schoolId) return { ok: false, message: "Pick a home school." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: NO_KEY };

  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return { ok: false, message: error.message };
  const authUserId = data.user?.id;
  if (!authUserId) return { ok: false, message: "Auth user was not created." };

  const supabase = await createClient();
  const { error: linkErr } = await supabase.rpc("admin_create_school_admin_link", {
    p_auth_user_id: authUserId,
    p_school_id: schoolId,
    p_email: email,
  });
  if (linkErr) return { ok: false, message: `Login created but linking failed: ${linkErr.message}` };

  revalidatePath("/manage/school-admins");
  return { ok: true, message: `School-admin login created for ${email}. Share the temporary password.` };
}

// ---------- Bulk teacher logins ----------

export type BulkRow = { name: string; email: string; password: string };
export type BulkResult =
  | { ok: boolean; message: string; created: BulkRow[]; skipped: { name: string; reason: string }[] }
  | undefined;

type TeacherLoginRow = {
  person_id: number;
  teacher_name: string | null;
  primary_email: string | null;
  has_login: boolean;
};

export async function bulkCreateTeacherLoginsAction(): Promise<BulkResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: NO_KEY, created: [], skipped: [] };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_teacher_logins");
  if (error) return { ok: false, message: error.message, created: [], skipped: [] };

  const teachers = (data ?? []) as TeacherLoginRow[];
  const pending = teachers.filter((t) => !t.has_login);

  const created: BulkRow[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const t of pending) {
    const name = t.teacher_name ?? `Person ${t.person_id}`;
    const email = t.primary_email?.trim().toLowerCase();
    if (!email) {
      skipped.push({ name, reason: "No email on file" });
      continue;
    }
    const password = tempPassword();
    const { data: created_user, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (cErr || !created_user.user?.id) {
      skipped.push({ name, reason: cErr?.message ?? "Could not create login" });
      continue;
    }
    const { error: linkErr } = await supabase.rpc("admin_link_teacher_login", {
      p_person_id: t.person_id,
      p_auth_user_id: created_user.user.id,
    });
    if (linkErr) {
      skipped.push({ name, reason: `Linking failed: ${linkErr.message}` });
      continue;
    }
    created.push({ name, email, password });
  }

  revalidatePath("/manage/logins");
  return {
    ok: true,
    message: `Created ${created.length} login${created.length === 1 ? "" : "s"}${
      skipped.length ? `, skipped ${skipped.length}` : ""
    }.`,
    created,
    skipped,
  };
}
