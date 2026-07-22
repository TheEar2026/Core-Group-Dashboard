import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { LoginsManager, type TeacherLoginRow } from "./logins-manager";
import { PasswordResetCard, type ResetAccount } from "./password-reset-card";

type SchoolAdminRow = { email: string | null; school_name: string | null };

export default async function ManageLoginsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: role } = await supabase.rpc("get_my_role");
  if (role !== "super_admin") redirect("/analytics");

  const [teacherRes, schoolAdminRes] = await Promise.all([
    supabase.rpc("admin_list_teacher_logins"),
    supabase.rpc("admin_list_school_admins"),
  ]);
  const teachers = (teacherRes.data ?? []) as TeacherLoginRow[];
  const schoolAdmins = (schoolAdminRes.data ?? []) as SchoolAdminRow[];
  const serviceKeyConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const resetAccounts: ResetAccount[] = [
    ...teachers
      .filter((t) => t.has_login && t.primary_email)
      .map((t) => ({
        email: t.primary_email as string,
        label: `${t.teacher_name ?? "Teacher"} — ${t.primary_email}`,
        group: "Teacher",
      })),
    ...schoolAdmins
      .filter((a) => a.email)
      .map((a) => ({
        email: a.email as string,
        label: `${a.email}${a.school_name ? ` (${a.school_name})` : ""}`,
        group: "School-admin",
      })),
  ];

  return (
    <AppShell email={user?.email} role={role}>
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[30px] font-bold tracking-[-0.02em]">Teacher logins</h1>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
            Give a teacher access to their own courses. They sign in and see only their lessons.
          </p>
        </div>
        <Link
          href="/manage"
          className="inline-block rounded-lg border border-[var(--brand-border)] px-4 py-2 text-sm font-medium transition-all hover:bg-[var(--brand-bg)]"
        >
          ← Manage
        </Link>
      </header>

      {!serviceKeyConfigured && (
        <div
          className="mb-6 rounded-lg border p-3 text-sm"
          style={{
            color: "var(--status-warning)",
            borderColor: "color-mix(in srgb, var(--status-warning) 25%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--status-warning) 8%, transparent)",
          }}
        >
          Creating logins and resetting passwords need <code>SUPABASE_SERVICE_ROLE_KEY</code> set as a
          server environment variable in Vercel (Settings → Environment Variables), then a redeploy.
          Until then the forms below will report that it&apos;s missing.
        </div>
      )}

      <div className="flex flex-col gap-6">
        <PasswordResetCard accounts={resetAccounts} />
        <LoginsManager teachers={teachers} />
      </div>
    </AppShell>
  );
}
