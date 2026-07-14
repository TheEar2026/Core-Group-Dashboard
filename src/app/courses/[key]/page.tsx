import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/brand";
import { decodeCourseKey } from "@/lib/course-key";

type CompletionRow = {
  person_id: number;
  teacher_name: string | null;
  school_id: number | null;
  school_name: string | null;
  course_title: string | null;
  lessons_completed: number | string | null;
  lessons_total: number | string | null;
  completion_pct: number | string | null;
  snapshot_date: string | null;
};

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? null : n;
}

function fmt(v: number | string | null | undefined): string {
  const n = num(v);
  return n === null ? "—" : n.toLocaleString();
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const TH =
  "px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--on-surface-variant)] whitespace-nowrap";
const TD = "px-4 py-3 text-[13px] whitespace-nowrap";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const courseUrl = decodeCourseKey(key);
  if (!courseUrl) {
    notFound();
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("get_course_completion", {
    target_course_url: courseUrl,
  });

  const rows = ((data ?? []) as CompletionRow[]).slice().sort((a, b) => {
    const pa = num(a.completion_pct) ?? -1;
    const pb = num(b.completion_pct) ?? -1;
    return pb - pa;
  });

  if (!error && rows.length === 0) {
    notFound();
  }

  const courseTitle = rows[0]?.course_title ?? "Untitled course";
  const teacherCount = rows.length;
  const completedValues = rows.map((r) => num(r.completion_pct)).filter((v): v is number => v !== null);
  const avgCompletion =
    completedValues.length > 0
      ? completedValues.reduce((a, b) => a + b, 0) / completedValues.length
      : null;
  const totalCompleted = rows.reduce((sum, r) => sum + (num(r.lessons_completed) ?? 0), 0);
  const totalAssigned = rows.reduce((sum, r) => sum + (num(r.lessons_total) ?? 0), 0);

  const showSchoolColumn = new Set(rows.map((r) => r.school_id)).size > 1;

  return (
    <AppShell email={user?.email}>
      <Link
        href="/teachers"
        className="mb-4 inline-block text-sm font-medium"
        style={{ color: "var(--brand-gold)" }}
      >
        ← Back to Teachers
      </Link>

        <header className="mb-8">
          <h1 className="text-[30px] font-bold tracking-[-0.02em]">{courseTitle}</h1>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
            Course completion across teachers.
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
            Couldn&apos;t load course data: {error.message}
          </div>
        )}

        {/* KPI strip */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              Teachers tracked
            </p>
            <p className="mt-2 text-[30px] font-bold tracking-[-0.02em]">{teacherCount}</p>
          </div>
          <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              Avg completion %
            </p>
            <div className="mt-2">
              <StatusBadge value={avgCompletion} />
            </div>
          </div>
          <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              Lessons completed
            </p>
            <p className="mt-2 text-[30px] font-bold tracking-[-0.02em]">
              {fmt(totalCompleted)}
              <span className="text-lg font-normal text-[var(--on-surface-variant)]"> / {fmt(totalAssigned)}</span>
            </p>
          </div>
        </div>

        {/* Per-teacher completion table */}
        <div className="overflow-hidden rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr
                  className="border-b border-[var(--brand-border)]"
                  style={{ backgroundColor: "var(--brand-header-tint)" }}
                >
                  <th className={TH}>Teacher</th>
                  {showSchoolColumn && <th className={TH}>School</th>}
                  <th className={TH}>Lessons</th>
                  <th className={TH}>Completion</th>
                  <th className={TH}>Last updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--brand-border)]">
                {rows.map((r) => (
                  <tr key={r.person_id} className="transition-colors hover:bg-[var(--brand-bg)]">
                    <td className={`${TD} font-semibold`} style={{ color: "var(--brand-gold)" }}>
                      <Link href={`/teachers/${r.person_id}`} className="hover:underline">
                        {r.teacher_name ?? "—"}
                      </Link>
                    </td>
                    {showSchoolColumn && (
                      <td className={`${TD} text-[var(--on-surface-variant)]`}>{r.school_name ?? "—"}</td>
                    )}
                    <td className={TD}>
                      {fmt(r.lessons_completed)}
                      <span className="text-[var(--on-surface-variant)]"> / {fmt(r.lessons_total)}</span>
                    </td>
                    <td className={TD}>
                      <StatusBadge value={num(r.completion_pct)} />
                    </td>
                    <td className={`${TD} text-[var(--on-surface-variant)]`}>{fmtDate(r.snapshot_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3 text-[13px] text-[var(--on-surface-variant)]">
            Showing {rows.length} {rows.length === 1 ? "teacher" : "teachers"}
          </div>
        </div>
    </AppShell>
  );
}
