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

// ---------- Password reset ----------

export type ResetState =
  | { ok: boolean; message: string; email?: string; password?: string }
  | undefined;

/**
 * Reset any teacher/school-admin login's password. The super-admin gets the
 * request by email, picks (or types) the account's login email, sets a new
 * password, and passes it back to the person. Resolves the auth user by its
 * actual sign-in email so it works even if that differs from the person's
 * on-file email.
 */
export async function resetPasswordAction(_prev: ResetState, form: FormData): Promise<ResetState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email) return { ok: false, message: "Choose or enter the account's login email." };
  if (password.length < 8) return { ok: false, message: "New password must be at least 8 characters." };

  const supabase = await createClient();
  const { data: role } = await supabase.rpc("get_my_role");
  if (role !== "super_admin") return { ok: false, message: "Only a super-admin can reset passwords." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: NO_KEY };

  // Find the auth user by their sign-in email. The user base is small, so a
  // bounded page walk is plenty; stop as soon as we match or run out.
  let targetId: string | undefined;
  for (let page = 1; page <= 20 && !targetId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return { ok: false, message: error.message };
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (match) targetId = match.id;
    if (!data.nextPage) break;
  }
  if (!targetId) return { ok: false, message: `No login found for ${email}. Check the exact sign-in email.` };

  const { error: updErr } = await admin.auth.admin.updateUserById(targetId, { password });
  if (updErr) return { ok: false, message: updErr.message };

  return {
    ok: true,
    message: `Password reset for ${email}. Send them the new password securely — it won't be shown again.`,
    email,
    password,
  };
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
