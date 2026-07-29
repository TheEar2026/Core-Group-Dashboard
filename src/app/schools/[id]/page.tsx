import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/brand";
import { TrendChart, ChartLegend } from "@/components/trend-chart";
import { TeacherTable, type TeacherRow } from "@/app/teachers/teacher-table";
import type { SchoolReportRow } from "@/app/dashboard/page";

type TrendRow = {
  school_id: number;
  school_name: string;
  snapshot_date: string;
  drived_users: number | string | null;
  drived_invited: number | string | null;
  drived_accepted: number | string | null;
  drived_logged: number | string | null;
  drived_studied: number | string | null;
  lms_avg_completion_pct: number | string | null;
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

const GOLD = "#A8884C";
const GOLD_DARK = "#6B5A2E";
const GRAY = "#94A3B8";

export default async function SchoolTrendPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const schoolId = Number(id);
  if (!Number.isInteger(schoolId)) {
    notFound();
  }

  const supabase = await createClient();

  const [userRes, roleRes, reportRes, trendRes, teacherRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_my_role"),
    supabase.rpc("get_my_school_report"),
    supabase.rpc("get_my_school_trend", { target_school_id: schoolId }),
    supabase.rpc("get_my_teacher_report"),
  ]);
  const user = userRes.data.user;
  const role = roleRes.data as string | null;
  if (role === "teacher") redirect("/my-courses");

  const allSchools = (reportRes.data ?? []) as SchoolReportRow[];
  const summary = allSchools.find((s) => s.school_id === schoolId);

  if (!summary) {
    notFound();
  }

  // Group-wide average completion, weighted by lessons (same convention as the
  // School Report's totals row: sum of completed / sum of assigned), so this
  // school's rate can be read against the group rather than in isolation.
  const groupTotals = allSchools.reduce(
    (acc, s) => ({
      done: acc.done + (num(s.total_lessons_completed) ?? 0),
      assigned: acc.assigned + (num(s.total_lessons_assigned) ?? 0),
    }),
    { done: 0, assigned: 0 },
  );
  const groupAvgCompletionPct =
    groupTotals.assigned > 0 ? Math.round((groupTotals.done / groupTotals.assigned) * 100) : null;

  const trend = (trendRes.data ?? []) as TrendRow[];
  const schoolTeachers = ((teacherRes.data ?? []) as TeacherRow[]).filter(
    (t) => t.school_id === schoolId,
  );
  const dates = trend.map((t) => t.snapshot_date);

  return (
    <AppShell email={user?.email} role={role}>
      <Link
        href="/dashboard"
        className="mb-4 inline-block text-sm font-medium"
        style={{ color: "var(--brand-gold)" }}
      >
        ← Back to School Report
      </Link>

        <header className="mb-8">
          <h1 className="text-[30px] font-bold tracking-[-0.02em]">{summary.school_name}</h1>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">Engagement trend over time</p>
        </header>

        {/* KPI strip */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              Total users
            </p>
            <p className="mt-2 text-[30px] font-bold tracking-[-0.02em]">{fmt(summary.drived_users)}</p>
          </div>
          <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              Active users
            </p>
            <p className="mt-2 text-[30px] font-bold tracking-[-0.02em]">
              {fmt(summary.product_fruits_active_users)}
            </p>
            <p className="mt-1 text-[12px] text-[var(--on-surface-variant)]">
              {fmt(summary.product_fruits_teachers)} teachers · {fmt(summary.product_fruits_admins)} admins
            </p>
          </div>
          <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              Lessons completed
            </p>
            <p className="mt-2 text-[30px] font-bold tracking-[-0.02em]">
              {fmt(summary.total_lessons_completed)}
              <span className="text-lg font-normal text-[var(--on-surface-variant)]">
                {" "}
                / {fmt(summary.total_lessons_assigned)}
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              This school&apos;s completion
            </p>
            <div className="mt-2">
              <StatusBadge value={num(summary.lms_avg_completion_pct)} />
            </div>
          </div>
          <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              Group average completion
            </p>
            <p className="mt-2 text-[30px] font-bold tracking-[-0.02em]">
              {groupAvgCompletionPct === null ? "—" : `${groupAvgCompletionPct}%`}
            </p>
            <p className="mt-1 text-[12px] text-[var(--on-surface-variant)]">Across all {allSchools.length} schools</p>
          </div>
        </div>

        {/* Teacher roster for this school */}
        <div className="mb-8">
          <h2 className="mb-3 text-base font-semibold">
            Teachers at this school
            <span className="ml-1.5 font-normal text-[var(--on-surface-variant)]">({schoolTeachers.length})</span>
          </h2>
          <TeacherTable
            rows={schoolTeachers}
            hideSchoolFilter
            emptyMessage="No teachers on record for this school yet."
          />
        </div>

        {trend.length === 0 ? (
          <p className="text-sm text-[var(--on-surface-variant)]">
            No trend history recorded for this school yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {trend.length === 1 && (
              <p className="text-[13px] text-[var(--on-surface-variant)]">
                Only one snapshot recorded so far — the trend below will build up as more data comes in.
              </p>
            )}
            {/* Drived adoption */}
            <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
              <h2 className="mb-2 text-base font-semibold">Drived adoption</h2>
              <ChartLegend
                series={[
                  { label: "Users", color: GOLD },
                  { label: "Invited", color: GOLD_DARK },
                  { label: "Accepted", color: GRAY },
                  { label: "Logged in", color: "#4B5563" },
                  { label: "Studied", color: "#1F2937" },
                ]}
              />
              <TrendChart
                dates={dates}
                series={[
                  { label: "Users", color: GOLD, values: trend.map((t) => num(t.drived_users)) },
                  { label: "Invited", color: GOLD_DARK, values: trend.map((t) => num(t.drived_invited)) },
                  { label: "Accepted", color: GRAY, values: trend.map((t) => num(t.drived_accepted)) },
                  { label: "Logged in", color: "#4B5563", values: trend.map((t) => num(t.drived_logged)) },
                  { label: "Studied", color: "#1F2937", values: trend.map((t) => num(t.drived_studied)) },
                ]}
              />
            </div>

            <div className="grid grid-cols-1 gap-6">
              {/* Lesson completion % */}
              <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
                <h2 className="mb-2 text-base font-semibold">Lesson completion %</h2>
                <TrendChart
                  dates={dates}
                  valueSuffix="%"
                  series={[
                    {
                      label: "Completion %",
                      color: GOLD,
                      values: trend.map((t) => num(t.lms_avg_completion_pct)),
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        )}
    </AppShell>
  );
}
