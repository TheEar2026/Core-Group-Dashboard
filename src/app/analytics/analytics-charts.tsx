"use client";

import { useState } from "react";
import type { SchoolReportRow } from "@/app/dashboard/page";
import type { AttentionTeacher } from "./attention-panel";

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

/* ---------- leaderboard ---------- */

type Ranked = { key: string; label: string; sublabel?: string; pct: number };

function rankTopAndBottom(items: Ranked[], n = 3): { top: Ranked[]; bottom: Ranked[] } {
  const sorted = [...items].sort((a, b) => b.pct - a.pct);
  const top = sorted.slice(0, n);
  // Start the bottom slice right after the top ends (never earlier), so a
  // short list can't show the same entry in both "Leading" and "Building
  // momentum" — e.g. with 5 items and n=3, bottom is just the remaining 2.
  const bottomStart = Math.max(n, sorted.length - n);
  const bottom = sorted.slice(bottomStart).reverse();
  return { top, bottom };
}

function RankList({ title, items, tone }: { title: string; items: Ranked[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">
        {title}
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => (
          <li key={it.key} className="flex items-start gap-2.5 text-[13px]">
            <span
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
              style={{ backgroundColor: `color-mix(in srgb, ${tone} 15%, transparent)`, color: tone }}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium" title={it.label}>
                  {it.label}
                </span>
                <span className="shrink-0 font-semibold tabular-nums" style={{ color: tone }}>
                  {Math.round(it.pct)}%
                </span>
              </div>
              {it.sublabel && (
                <div className="truncate text-[12px] text-[var(--on-surface-variant)]" title={it.sublabel}>
                  {it.sublabel}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Leaderboard({ schools, teachers }: { schools: Ranked[]; teachers: Ranked[] }) {
  if (schools.length === 0 && teachers.length === 0) {
    return <EmptyPlot label="No completion data yet — leaders will appear once lessons are being ticked off." />;
  }
  const schoolRanks = rankTopAndBottom(schools);
  const teacherRanks = rankTopAndBottom(teachers);

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <div className="flex flex-col gap-5">
        <p className="text-[12px] font-bold uppercase tracking-[0.05em] text-[var(--on-surface-variant)]">Schools</p>
        <RankList title="Leading" items={schoolRanks.top} tone="var(--status-success)" />
        <RankList title="Building momentum" items={schoolRanks.bottom} tone="var(--on-surface-variant)" />
        {schoolRanks.top.length === 0 && (
          <p className="text-[13px] text-[var(--on-surface-variant)]">Not enough data yet.</p>
        )}
      </div>
      <div className="flex flex-col gap-5">
        <p className="text-[12px] font-bold uppercase tracking-[0.05em] text-[var(--on-surface-variant)]">Teachers</p>
        <RankList title="Leading" items={teacherRanks.top} tone="var(--status-success)" />
        <RankList title="Building momentum" items={teacherRanks.bottom} tone="var(--on-surface-variant)" />
        {teacherRanks.top.length === 0 && (
          <p className="text-[13px] text-[var(--on-surface-variant)]">Not enough data yet.</p>
        )}
      </div>
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

export function AnalyticsCharts({ rows, teachers }: { rows: SchoolReportRow[]; teachers: AttentionTeacher[] }) {
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

  // Only rank entries that actually have lessons assigned — otherwise schools/
  // teachers with nothing loaded yet would show up as false "0%" bottom entries.
  const rankableSchools: Ranked[] = rows
    .filter((r) => num(r.total_lessons_assigned) > 0)
    .map((r) => ({
      key: String(r.school_id),
      label: r.school_name,
      sublabel: `${num(r.total_lessons_completed).toLocaleString()}/${num(r.total_lessons_assigned).toLocaleString()}`,
      pct: num(r.lms_avg_completion_pct) ?? 0,
    }));

  const rankableTeachers: Ranked[] = teachers
    .filter((t) => num(t.total_lessons_assigned) > 0)
    .map((t) => ({
      key: String(t.person_id),
      label: t.teacher_name ?? `Teacher ${t.person_id}`,
      sublabel: t.school_name ?? undefined,
      pct: num(t.avg_completion_pct) ?? 0,
    }));

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

        <Card title="Leaderboard" subtitle="Ranked by lesson completion — only counts schools/teachers with lessons assigned">
          <Leaderboard schools={rankableSchools} teachers={rankableTeachers} />
        </Card>
      </div>
    </div>
  );
}
