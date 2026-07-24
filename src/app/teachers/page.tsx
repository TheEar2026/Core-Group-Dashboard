import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { TeacherTable, type TeacherRow } from "./teacher-table";

export default async function TeachersPage() {
  const supabase = await createClient();

  const [{ data: { user } }, { data: role }, { data, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_my_role"),
    supabase.rpc("get_my_teacher_report"),
  ]);
  if (role === "teacher") redirect("/my-courses");
  const rows = (data ?? []) as TeacherRow[];

  return (
    <AppShell email={user?.email} role={role}>
      <header className="mb-8">
        <h1 className="text-[30px] font-bold tracking-[-0.02em]">Teachers</h1>
        <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
          Teacher engagement and lesson completion for your school.
        </p>
      </header>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-lg border p-3 text-sm"
            style={{
              color: "var(--status-danger)",
              borderColor: "color-mix(in srgb, var(--status-danger) 20%, transparent)",
              backgroundColor: "color-mix(in srgb, var(--status-danger) 8%, transparent)",
            }}
          >
            Couldn&apos;t load teachers: {error.message}
          </div>
        )}

        {!error && rows.length === 0 && (
          <p className="text-sm text-[var(--on-surface-variant)]">
            No teachers available for this account.
          </p>
        )}

        {rows.length > 0 && <TeacherTable rows={rows} />}
    </AppShell>
  );
}
