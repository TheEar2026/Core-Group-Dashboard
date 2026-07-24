import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";

type MyCourse = {
  course_id: number;
  grade: string | null;
  title: string;
  lessons_total: number | string | null;
  lessons_completed: number | string | null;
  completion_pct: number | string | null;
};

type LoginStats = { login_count: number | string | null; last_login_at: string | null };

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function fmtDateTime(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export default async function MyCoursesPage() {
  const supabase = await createClient();

  const [{ data: { user } }, { data: role }, { data, error }, loginStatsRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_my_role"),
    supabase.rpc("get_my_courses"),
    supabase.rpc("get_my_login_stats"),
  ]);

  // This area is teacher-only. Staff are sent to their dashboard.
  if (role !== "teacher") {
    redirect("/analytics");
  }
  const courses = (data ?? []) as MyCourse[];
  const loginStats = (loginStatsRes.data?.[0] ?? null) as LoginStats | null;

  return (
    <AppShell email={user?.email} role={role}>
      <header className="mb-8">
        <h1 className="text-[30px] font-bold tracking-[-0.02em]">My Courses</h1>
        <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
          Tick off each lesson as you complete it. Your progress updates automatically.
        </p>
      </header>

      {/* My activity */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:max-w-md">
        <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Total logins</p>
          <p className="mt-2 text-[28px] font-bold leading-none tracking-[-0.02em]">
            {num(loginStats?.login_count).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Last login</p>
          <p className="mt-2 text-[15px] font-bold leading-tight tracking-[-0.01em]">
            {fmtDateTime(loginStats?.last_login_at ?? null)}
          </p>
        </div>
      </div>

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
          Couldn&apos;t load your courses: {error.message}
        </div>
      )}

      {!error && courses.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--brand-border)] bg-[var(--surface)] p-12 text-center text-sm text-[var(--on-surface-variant)]">
          No courses have been assigned to you yet.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {courses.map((c) => {
          const total = num(c.lessons_total);
          const done = num(c.lessons_completed);
          const pct = num(c.completion_pct);
          return (
            <Link
              key={c.course_id}
              href={`/my-courses/${c.course_id}`}
              className="group block rounded-2xl border border-[var(--brand-border)] bg-[var(--surface)] p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--brand-gold)] hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {c.grade && (
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                      style={{ color: "var(--brand-gold)", backgroundColor: "color-mix(in srgb, var(--brand-gold) 14%, transparent)" }}
                    >
                      {c.grade}
                    </span>
                  )}
                  <p className="mt-2 text-[16px] font-semibold group-hover:text-[var(--brand-gold)]">{c.title}</p>
                </div>
                <span className="text-[var(--on-surface-variant)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--brand-gold)]" aria-hidden>
                  →
                </span>
              </div>

              <div className="mt-5">
                <div className="mb-1.5 flex items-center justify-between text-[13px]">
                  <span className="text-[var(--on-surface-variant)]">
                    {total === 0 ? "No lessons yet" : `${done} of ${total} lessons`}
                  </span>
                  <span className="font-semibold">{pct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--brand-header-tint)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: "var(--brand-gold)" }} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
