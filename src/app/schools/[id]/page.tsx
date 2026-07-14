import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/top-nav";
import { StatusBadge } from "@/components/brand";
import { TrendChart, ChartLegend } from "@/components/trend-chart";
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
  vimeo_avg_pct_watched: number | string | null;
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [reportRes, trendRes] = await Promise.all([
    supabase.rpc("get_my_school_report"),
    supabase.rpc("get_my_school_trend", { target_school_id: schoolId }),
  ]);

  const summary = ((reportRes.data ?? []) as SchoolReportRow[]).find(
    (s) => s.school_id === schoolId,
  );

  if (!summary) {
    notFound();
  }

  const trend = (trendRes.data ?? []) as TrendRow[];
  const dates = trend.map((t) => t.snapshot_date);

  return (
    <div className="min-h-screen bg-[var(--brand-bg)] text-[var(--on-surface)]">
      <TopNav active="dashboard" email={user?.email} />

      <main className="mx-auto max-w-[1440px] px-6 pb-12 pt-24">
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
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[var(--brand-border)] bg-white p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              Total users
            </p>
            <p className="mt-2 text-[30px] font-bold tracking-[-0.02em]">{fmt(summary.drived_users)}</p>
          </div>
          <div className="rounded-xl border border-[var(--brand-border)] bg-white p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              Avg watch %
            </p>
            <div className="mt-2">
              <StatusBadge value={num(summary.vimeo_avg_pct_watched)} />
            </div>
          </div>
          <div className="rounded-xl border border-[var(--brand-border)] bg-white p-6">
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
          <div className="rounded-xl border border-[var(--brand-border)] bg-white p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              Completion %
            </p>
            <div className="mt-2">
              <StatusBadge value={num(summary.lms_avg_completion_pct)} />
            </div>
          </div>
        </div>

        {trend.length === 0 ? (
          <p className="text-sm text-[var(--on-surface-variant)]">
            No trend history recorded for this school yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {/* Drived adoption */}
            <div className="rounded-xl border border-[var(--brand-border)] bg-white p-6">
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

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Vimeo watch % */}
              <div className="rounded-xl border border-[var(--brand-border)] bg-white p-6">
                <h2 className="mb-2 text-base font-semibold">Vimeo watch %</h2>
                <TrendChart
                  dates={dates}
                  area
                  valueSuffix="%"
                  series={[
                    {
                      label: "Avg % watched",
                      color: GOLD,
                      values: trend.map((t) => num(t.vimeo_avg_pct_watched)),
                    },
                  ]}
                />
              </div>

              {/* Lesson completion % */}
              <div className="rounded-xl border border-[var(--brand-border)] bg-white p-6">
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
      </main>
    </div>
  );
}
