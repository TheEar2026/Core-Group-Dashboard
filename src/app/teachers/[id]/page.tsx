import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/top-nav";
import { ProgressBar, StatusBadge } from "@/components/brand";
import type { TeacherRow } from "../teacher-table";

type LoginEvent = {
  event_datetime: string;
  user_role: string | null;
  product_type: string | null;
};

type LessonRow = {
  course_title: string | null;
  course_url: string | null;
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

  const [teacherReportRes, loginActivityRes, lessonProgressRes] = await Promise.all([
    supabase.rpc("get_my_teacher_report"),
    supabase.rpc("get_teacher_login_activity", { target_person_id: personId }),
    supabase.rpc("get_teacher_lesson_progress", { target_person_id: personId }),
  ]);

  const profile = ((teacherReportRes.data ?? []) as TeacherRow[]).find(
    (t) => t.person_id === personId,
  );

  if (!profile) {
    notFound();
  }

  const loginEvents = (loginActivityRes.data ?? []) as LoginEvent[];
  const lessons = (lessonProgressRes.data ?? []) as LessonRow[];

  const now = new Date();
  const loginsThisMonth = loginEvents.filter((e) => {
    const d = new Date(e.event_datetime);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div className="min-h-screen bg-[var(--brand-bg)] text-[var(--on-surface)]">
      <TopNav active="teachers" email={user?.email} />

      <main className="mx-auto max-w-[1440px] px-6 pb-12 pt-24">
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
          <div className="rounded-xl border border-[var(--brand-border)] bg-white p-6">
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
          <div className="rounded-xl border border-[var(--brand-border)] bg-white p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              Logins this month
            </p>
            <p className="mt-2 text-[30px] font-bold tracking-[-0.02em]">{loginsThisMonth}</p>
          </div>
          <div className="rounded-xl border border-[var(--brand-border)] bg-white p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              Last active
            </p>
            <p className="mt-2 text-[30px] font-bold tracking-[-0.02em]">
              {fmtRelative(profile.last_product_fruits_activity)}
            </p>
          </div>
        </div>

        {/* Two-panel layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Login activity */}
          <div className="rounded-xl border border-[var(--brand-border)] bg-white p-6">
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
                    <span className="text-sm">{fmtDateTime(e.event_datetime)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Lesson progress */}
          <div className="rounded-xl border border-[var(--brand-border)] bg-white p-6">
            <h2 className="mb-4 text-base font-semibold">Lesson progress</h2>
            {lessons.length === 0 ? (
              <p className="text-sm text-[var(--on-surface-variant)]">No lesson data recorded.</p>
            ) : (
              <div className="space-y-4">
                {lessons.map((l) => (
                  <div
                    key={l.course_url ?? l.course_title}
                    className="rounded-lg border border-[var(--brand-border)] p-4"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{l.course_title ?? "Untitled course"}</span>
                      <StatusBadge value={num(l.completion_pct)} />
                    </div>
                    <ProgressBar value={num(l.completion_pct)} />
                    <p className="mt-1 text-xs text-[var(--on-surface-variant)]">
                      {fmt(l.lessons_completed)} of {fmt(l.lessons_total)} lessons completed
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
