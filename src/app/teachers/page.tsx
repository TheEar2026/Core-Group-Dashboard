import { createClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/top-nav";
import { TeacherTable, type TeacherRow } from "./teacher-table";

export default async function TeachersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("get_my_teacher_report");
  const rows = (data ?? []) as TeacherRow[];

  return (
    <div className="min-h-screen bg-[var(--brand-bg)] text-[var(--on-surface)]">
      <TopNav active="teachers" email={user?.email} />

      <main className="mx-auto max-w-[1440px] px-6 pb-12 pt-24">
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
      </main>
    </div>
  );
}
