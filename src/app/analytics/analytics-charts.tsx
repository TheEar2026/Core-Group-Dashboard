"use client";

import { useState } from "react";
import type { SchoolReportRow } from "@/app/dashboard/page";

/* ---------- helpers ---------- */

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function compact(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
  return n.toLocaleString();
}

/** Traffic-light status colour, matching the rest of the app (green ≥80 / amber 60–79 / red <60). */
function statusVar(pct: number): string {
  if (pct >= 80) return "var(--status-success)";
  if (pct >= 60) return "var(--status-warning)";
  return "var(--status-danger)";
}

type Tip = { x: number; y: number; label: string; value: string } | null;

/* ---------- shared card ---------- */

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6 shadow-sm">
      <h2 className="text-base font-semibold">{title}</h2>
      {subtitle && <p className="mt-0.5 text-[13px] text-[var(--on-surface-variant)]">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function EmptyPlot({ label }: { label: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-[var(--brand-border)] text-[13px] text-[var(--on-surface-variant)]">
      {label}
    </div>
  );
}

/* ---------- KPI tile ---------- */

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-5 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">{label}</p>
      <p className="mt-2 text-[28px] font-bold leading-none tracking-[-0.02em]">{value}</p>
      {hint && <p className="mt-2 text-[12px] text-[var(--on-surface-variant)]">{hint}</p>}
    </div>
  );
}

/* ---------- horizontal bar chart ---------- */

type BarDatum = { label: string; value: number; color: string };

function HBarChart({
  data,
  formatValue = (v: number) => v.toLocaleString(),
  emptyLabel,
}: {
  data: BarDatum[];
  formatValue?: (v: number) => string;
  emptyLabel: string;
}) {
  const [tip, setTip] = useState<Tip>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const hasData = data.some((d) => d.value > 0);

  if (!hasData) return <EmptyPlot label={emptyLabel} />;

  return (
    <>
      <div className="flex flex-col gap-2.5">
        {data.map((d) => {
          const pct = (d.value / max) * 100;
          return (
            <div key={d.label} className="grid grid-cols-[minmax(96px,140px)_1fr] items-center gap-3">
              <span className="truncate text-[12px] text-[var(--on-surface-variant)]" title={d.label}>
                {d.label}
              </span>
              <div className="flex items-center gap-2">
                <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-[var(--brand-bg)]">
                  <div
                    className="h-full rounded-md transition-[width] duration-500"
                    style={{ width: `${Math.max(pct, d.value > 0 ? 2 : 0)}%`, backgroundColor: d.color }}
                    onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, label: d.label, value: formatValue(d.value) })}
                    onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, label: d.label, value: formatValue(d.value) })}
                    onMouseLeave={() => setTip(null)}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-[12px] font-semibold tabular-nums">{formatValue(d.value)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <Tooltip tip={tip} />
    </>
  );
}

/* ---------- donut ---------- */

type DonutSlice = { label: string; value: number; color: string };

function Donut({ slices }: { slices: DonutSlice[] }) {
  const [tip, setTip] = useState<Tip>(null);
  const total = slices.reduce((s, d) => s + d.value, 0);

  if (total === 0) return <EmptyPlot label="No user activity yet — upload a Product Fruits export." />;

  const r = 60;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
      <div className="relative">
        <svg width={160} height={160} viewBox="0 0 160 160" className="-rotate-90">
          {slices.map((s) => {
            const frac = s.value / total;
            const len = frac * c;
            const seg = (
              <circle
                key={s.label}
                cx={80}
                cy={80}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={20}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                className="cursor-default"
                onMouseEnter={(e) =>
                  setTip({ x: e.clientX, y: e.clientY, label: s.label, value: `${s.value.toLocaleString()} (${Math.round(frac * 100)}%)` })
                }
                onMouseMove={(e) =>
                  setTip({ x: e.clientX, y: e.clientY, label: s.label, value: `${s.value.toLocaleString()} (${Math.round(frac * 100)}%)` })
                }
                onMouseLeave={() => setTip(null)}
              />
            );
            offset += len;
            return seg;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[24px] font-bold leading-none">{total.toLocaleString()}</span>
          <span className="text-[11px] text-[var(--on-surface-variant)]">active users</span>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-[13px]">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-[var(--on-surface-variant)]">{s.label}</span>
            <span className="font-semibold tabular-nums">{s.value.toLocaleString()}</span>
          </li>
        ))}
      </ul>
      <Tooltip tip={tip} />
    </div>
  );
}

/* ---------- floating tooltip ---------- */

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none fixed z-50 rounded-lg px-2.5 py-1.5 text-[12px] shadow-lg"
      style={{
        left: tip.x + 12,
        top: tip.y + 12,
        backgroundColor: "var(--on-surface)",
        color: "var(--surface)",
      }}
    >
      <div className="font-semibold">{tip.label}</div>
      <div>{tip.value}</div>
    </div>
  );
}

/* ---------- page body ---------- */

export function AnalyticsCharts({ rows }: { rows: SchoolReportRow[] }) {
  const totalActive = rows.reduce((s, r) => s + num(r.product_fruits_active_users), 0);
  const totalTeachers = rows.reduce((s, r) => s + num(r.product_fruits_teachers), 0);
  const totalAdmins = rows.reduce((s, r) => s + num(r.product_fruits_admins), 0);
  const participants = Math.max(0, totalActive - totalTeachers - totalAdmins);

  const lessonsDone = rows.reduce((s, r) => s + num(r.total_lessons_completed), 0);
  const lessonsAssigned = rows.reduce((s, r) => s + num(r.total_lessons_assigned), 0);
  const overallCompletion = lessonsAssigned > 0 ? Math.round((lessonsDone / lessonsAssigned) * 100) : 0;

  const activeBySchool: BarDatum[] = [...rows]
    .map((r) => ({ label: r.school_name, value: num(r.product_fruits_active_users), color: "var(--brand-gold)" }))
    .sort((a, b) => b.value - a.value);

  const completionBySchool: BarDatum[] = [...rows]
    .map((r) => {
      const v = num(r.lms_avg_completion_pct);
      return { label: r.school_name, value: v, color: statusVar(v) };
    })
    .sort((a, b) => b.value - a.value);

  return (
    <div className="flex flex-col gap-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Schools" value={rows.length.toLocaleString()} hint="Reporting group" />
        <Kpi label="Active users" value={compact(totalActive)} hint={`${totalTeachers.toLocaleString()} teachers · ${totalAdmins.toLocaleString()} admins`} />
        <Kpi label="Lessons completed" value={compact(lessonsDone)} hint={lessonsAssigned > 0 ? `of ${compact(lessonsAssigned)} assigned` : "No LMS data yet"} />
        <Kpi label="Avg completion" value={`${overallCompletion}%`} hint="Across all courses" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Active users by school" subtitle="Product Fruits — distinct users seen in the latest upload">
          <HBarChart data={activeBySchool} emptyLabel="No Product Fruits data yet — upload an export on Settings." />
        </Card>

        <Card title="Users by role" subtitle="Split of active users across the group">
          <Donut
            slices={[
              { label: "Teachers", value: totalTeachers, color: "var(--chart-teacher)" },
              { label: "School admins", value: totalAdmins, color: "var(--chart-admin)" },
              { label: "Participants", value: participants, color: "var(--chart-participant)" },
            ]}
          />
        </Card>

        <Card title="Lesson completion by school" subtitle="LMS — average course completion (green ≥80% · amber 60–79% · red <60%)">
          <HBarChart
            data={completionBySchool}
            formatValue={(v) => `${Math.round(v)}%`}
            emptyLabel="No LMS completion data yet — upload a Lesson Progress export."
          />
        </Card>

        <Card title="More metrics coming" subtitle="We'll define the key engagement metrics together">
          <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--brand-border)] text-center">
            <span className="text-[13px] text-[var(--on-surface-variant)]">
              This dashboard is wired to live data. Tell me which metrics matter most
            </span>
            <span className="text-[13px] text-[var(--on-surface-variant)]">and I&apos;ll add the charts to track them.</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
