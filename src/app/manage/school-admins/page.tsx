import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { SchoolAdminsManager, type SchoolOption, type SchoolAdminRow } from "./school-admins-manager";

export default async function ManageSchoolAdminsPage() {
  const supabase = await createClient();
  const [{ data: { user } }, { data: role }, schoolsRes, adminsRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_my_role"),
    supabase.rpc("admin_list_schools"),
    supabase.rpc("admin_list_school_admins"),
  ]);
  if (role !== "super_admin") redirect("/analytics");
  const schools = (schoolsRes.data ?? []) as SchoolOption[];
  const admins = (adminsRes.data ?? []) as SchoolAdminRow[];
  const serviceKeyConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return (
    <AppShell email={user?.email} role={role}>
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[30px] font-bold tracking-[-0.02em]">School-admin logins</h1>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
            School admins get read-only oversight of all 12 schools. The home school below is just a
            label on the account.
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
          variable in Vercel, then a redeploy.
        </div>
      )}

      <SchoolAdminsManager schools={schools} admins={admins} />
    </AppShell>
  );
}
