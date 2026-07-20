import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { ProgressBar, StatusBadge } from "@/components/brand";
import type { TeacherRow } from "../teacher-table";

type LoginEvent = {
  logged_in_at: string;
};

type CourseProgress = {
  course_id: number;
  grade: string | null;
  title: string | null;
  lessons_completed: number | string | null;
  lessons_total: number | string | null;
  completion_pct: number | string | null;
};

type AssignmentRow = {
  grade: string | null;
  course_title: string | null;
  school_id: number | null;
};

/** Normalise a grade label to a short chip, e.g. "Grade 1" -> "Gr 1", "Grade R" -> "Gr R". */
function gradeShort(g: string | null): string {
  if (!g) return "—";
  const m = g.match(/(\d+|R)\b/i);
  return m ? `Gr ${m[1].toUpperCase()}` : g;
}

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? null : n;
}

function fmt(v: number | string | null | undefined): string {
  const n = num(v);
  return n === null ? "—" : n.toLocaleString();
}

function fmtDateTime(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";

  const now = new Date();
  const isSameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (isSameDay) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, ${time}`;
}

function fmtRelative(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default async function TeacherDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isInteger(personId)) {
    notFound();
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [roleRes, teacherReportRes, loginActivityRes, lessonProgressRes, assignmentsRes] =
    await Promise.all([
      supabase.rpc("get_my_role"),
      supabase.rpc("get_my_teacher_report"),
      supabase.rpc("get_teacher_login_history", { target_person_id: personId }),
      supabase.rpc("get_person_catalog_progress", { target_person_id: personId }),
      supabase.rpc("get_teacher_assignments", { target_person_id: personId }),
    ]);
  const role = roleRes.data as string | null;
  if (role === "teacher") redirect("/my-courses");

  const profile = ((teacherReportRes.data ?? []) as TeacherRow[]).find(
    (t) => t.person_id === personId,
  );

  if (!profile) {
    notFound();
  }

  const loginEvents = (loginActivityRes.data ?? []) as LoginEvent[];
  const courseProgress = (lessonProgressRes.data ?? []) as CourseProgress[];
  const assignments = (assignmentsRes.data ?? []) as AssignmentRow[];

  // Group assigned courses by grade, preserving the RPC's Grade R -> 7 order.
  const assignmentsByGrade: { grade: string; courses: string[] }[] = [];
  for (const a of assignments) {
    const grade = a.grade?.trim() || "Unspecified grade";
    const course = a.course_title?.trim() || "Untitled course";
    const bucket = assignmentsByGrade.find((b) => b.grade === grade);
    if (bucket) bucket.courses.push(course);
    else assignmentsByGrade.push({ grade, courses: [course] });
  }

  return (
    <AppShell email={user?.email} role={role}>
      <Link
        href="/teachers"
        className="mb-4 inline-block text-sm font-medium"
        style={{ color: "var(--brand-gold)" }}
      >
        ← Back to Teachers
      </Link>

        <header className="mb-8">
          <h1 className="text-[30px] font-bold tracking-[-0.02em]">
            {profile.teacher_name ?? "Unknown teacher"}
          </h1>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
            {profile.primary_email ?? "—"}
          </p>
        </header>

        {/* Stat strip */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              Lessons completed
            </p>
            <p className="mt-2 text-[30px] font-bold tracking-[-0.02em]">
              {fmt(profile.total_lessons_completed)}
              <span className="text-lg font-normal text-[var(--on-surface-variant)]">
                {" "}
                / {fmt(profile.total_lessons_assigned)}
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              Total logins
            </p>
            <p className="mt-2 text-[30px] font-bold tracking-[-0.02em]">{fmt(profile.login_count)}</p>
          </div>
          <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              Last login
            </p>
            <p className="mt-2 text-[30px] font-bold tracking-[-0.02em]">
              {fmtRelative(profile.last_login_at)}
            </p>
          </div>
        </div>

        {/* Assigned grades & courses */}
        <div className="mb-6 rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Assigned grades &amp; courses</h2>
            {assignments.length > 0 && (
              <span className="text-[13px] text-[var(--on-surface-variant)]">
                {assignmentsByGrade.length} grade{assignmentsByGrade.length === 1 ? "" : "s"} ·{" "}
                {assignments.length} course{assignments.length === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {assignments.length === 0 ? (
            <p className="text-sm text-[var(--on-surface-variant)]">
              No grades or courses assigned yet.
              {role === "super_admin" && " Assign them on the Manage page."}
            </p>
          ) : (
            <div className="space-y-4">
              {assignmentsByGrade.map((b) => (
                <div key={b.grade} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
                  <span
                    className="inline-flex h-6 shrink-0 items-center rounded-full px-3 text-[12px] font-bold"
                    style={{
                      color: "var(--brand-gold)",
                      backgroundColor: "color-mix(in srgb, var(--brand-gold) 12%, transparent)",
                    }}
                  >
                    {gradeShort(b.grade)}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {b.courses.map((c, i) => (
                      <span
                        key={`${b.grade}-${i}`}
                        className="rounded-lg border border-[var(--brand-border)] px-3 py-1 text-[13px]"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Two-panel layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Login activity */}
          <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
            <h2 className="mb-4 text-base font-semibold">Login activity</h2>
            {loginEvents.length === 0 ? (
              <p className="text-sm text-[var(--on-surface-variant)]">No login activity recorded.</p>
            ) : (
              <ol className="space-y-4">
                {loginEvents.map((e, i) => (
                  <li key={i} className="relative flex gap-3 pl-4">
                    <span
                      className="absolute left-0 top-1.5 h-2 w-2 rounded-full"
                      style={{ backgroundColor: "var(--brand-gold)" }}
                      aria-hidden
                    />
                    {i < loginEvents.length - 1 && (
                      <span
                        className="absolute left-[3px] top-3.5 h-full w-px"
                        style={{ backgroundColor: "var(--brand-border)" }}
                        aria-hidden
                      />
                    )}
                    <span className="text-sm">{fmtDateTime(e.logged_in_at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Lesson progress (teacher's own ticks) */}
          <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
            <h2 className="mb-4 text-base font-semibold">Lesson progress</h2>
            {courseProgress.length === 0 ? (
              <p className="text-sm text-[var(--on-surface-variant)]">No courses assigned yet.</p>
            ) : (
              <div className="space-y-4">
                {courseProgress.map((c) => (
                  <div key={c.course_id} className="rounded-lg border border-[var(--brand-border)] p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">
                        {c.grade && <span className="text-[var(--on-surface-variant)]">{c.grade} · </span>}
                        {c.title ?? "Untitled course"}
                      </span>
                      <StatusBadge value={num(c.completion_pct)} />
                    </div>
                    <ProgressBar value={num(c.completion_pct)} />
                    <p className="mt-1 text-xs text-[var(--on-surface-variant)]">
                      {fmt(c.lessons_completed)} of {fmt(c.lessons_total)} lessons ticked
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
    </AppShell>
  );
}
