import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import {
  ManageForms,
  type SchoolOption,
  type TeacherOption,
  type AssignmentRow,
} from "./manage-forms";

export default async function ManagePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: role } = await supabase.rpc("get_my_role");

  // Management is super-admin only. School admins / teachers get bounced.
  if (role !== "super_admin") {
    redirect("/analytics");
  }

  const [schoolsRes, teachersRes, assignmentsRes] = await Promise.all([
    supabase.rpc("admin_list_schools"),
    supabase.rpc("admin_list_teachers"),
    supabase.rpc("admin_list_assignments"),
  ]);

  const schools = (schoolsRes.data ?? []) as SchoolOption[];
  const teachers = (teachersRes.data ?? []) as TeacherOption[];
  const assignments = (assignmentsRes.data ?? []) as AssignmentRow[];

  return (
    <AppShell email={user?.email} role={role}>
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[30px] font-bold tracking-[-0.02em]">Manage</h1>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
            Create schools and teachers, and assign teachers to schools and courses.
          </p>
        </div>
        <Link
          href="/manage/matches"
          className="inline-block rounded-lg border border-[var(--brand-border)] px-4 py-2 text-sm font-medium transition-all hover:bg-[var(--brand-bg)]"
        >
          Match review →
        </Link>
      </header>

      <ManageForms schools={schools} teachers={teachers} assignments={assignments} />
    </AppShell>
  );
}
