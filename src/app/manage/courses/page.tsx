import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { CoursesManager, type CourseRow } from "./courses-manager";

export default async function ManageCoursesPage() {
  const supabase = await createClient();
  const [{ data: { user } }, { data: role }, { data }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_my_role"),
    supabase.rpc("admin_list_courses"),
  ]);
  if (role !== "super_admin") redirect("/analytics");

  const courses = (data ?? []) as CourseRow[];

  return (
    <AppShell email={user?.email} role={role}>
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[30px] font-bold tracking-[-0.02em]">Courses &amp; lessons</h1>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
            Create courses, add their lessons, and assign teachers. Teachers tick lessons off on
            their own page.
          </p>
        </div>
        <Link
          href="/manage"
          className="inline-block rounded-lg border border-[var(--brand-border)] px-4 py-2 text-sm font-medium transition-all hover:bg-[var(--brand-bg)]"
        >
          ← Manage
        </Link>
      </header>

      <CoursesManager courses={courses} />
    </AppShell>
  );
}
