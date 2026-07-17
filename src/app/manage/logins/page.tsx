import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { LoginsManager, type TeacherLoginRow } from "./logins-manager";

export default async function ManageLoginsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: role } = await supabase.rpc("get_my_role");
  if (role !== "super_admin") redirect("/analytics");

  const { data } = await supabase.rpc("admin_list_teacher_logins");
  const teachers = (data ?? []) as TeacherLoginRow[];
  const serviceKeyConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

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
          Creating logins needs <code>SUPABASE_SERVICE_ROLE_KEY</code> set as a server environment
          variable in Vercel (Settings → Environment Variables), then a redeploy. Until then the form
          below will report that it&apos;s missing.
        </div>
      )}

      <LoginsManager teachers={teachers} />
    </AppShell>
  );
}
