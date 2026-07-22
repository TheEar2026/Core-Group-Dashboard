"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { SchoolReportRow } from "@/app/dashboard/page";

/** Teacher row shape drawn from get_my_teacher_report (v_teacher_report). */
export type AttentionTeacher = {
  person_id: number;
  teacher_name: string | null;
  school_name: string | null;
  total_lessons_completed: number | string | null;
  total_lessons_assigned: number | string | null;
  avg_completion_pct: number | string | null;
  login_count: number | string | null;
  last_login_at: string | null;
};

/* ---- tunable thresholds ---- */
const LOW_COMPLETION_PCT = 60; // schools that have started but sit below this need attention
const TEACHER_BEHIND_PCT = 40; // individual teachers below this (with work assigned) need a nudge
const INACTIVE_DAYS = 30; // teachers not seen in this many days, used as extra context

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

type Item = { key: string; href: string; primary: string; secondary: string; sort?: number };

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

const MAX_ROWS = 4;

function Section({
  title,
  color,
  items,
  moreHref,
}: {
  title: string;
  color: string;
  items: Item[];
  moreHref: string;
}) {
  if (items.length === 0) return null;
  const shown = items.slice(0, MAX_ROWS);
  const extra = items.length - shown.length;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <h3 className="text-[13px] font-semibold">
          {title}
          <span className="ml-1.5 font-normal text-[var(--on-surface-variant)]">({items.length})</span>
        </h3>
      </div>
      <ul className="flex flex-col gap-1">
        {shown.map((it) => (
          <li key={it.key}>
            <Link
              href={it.href}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors hover:bg-[var(--brand-bg)]"
            >
              <span className="min-w-0 truncate font-medium">{it.primary}</span>
              <span className="shrink-0 text-[12px] text-[var(--on-surface-variant)]">{it.secondary}</span>
            </Link>
          </li>
        ))}
      </ul>
      {extra > 0 && (
        <Link href={moreHref} className="mt-1 inline-block px-3 text-[12px] font-medium text-[var(--brand-gold)] hover:underline">
          +{extra} more →
        </Link>
      )}
    </div>
  );
}

export function AttentionPanel({
  schools,
  teachers,
  canManage = false,
}: {
  schools: SchoolReportRow[];
  teachers: AttentionTeacher[];
  canManage?: boolean;
}) {
  const signals = useMemo(() => {
    const notStarted: Item[] = [];
    const lowCompletion: Item[] = [];
    let notSetUp = 0;

    for (const s of schools) {
      const assigned = num(s.total_lessons_assigned);
      const done = num(s.total_lessons_completed);
      const href = `/schools/${s.school_id}`;
      if (assigned === 0) {
        notSetUp += 1;
        continue;
      }
      if (done === 0) {
        notStarted.push({
          key: `ns-${s.school_id}`,
          href,
          primary: s.school_name,
          secondary: `0 of ${assigned} lessons`,
        });
        continue;
      }
      const pct = num(s.lms_avg_completion_pct);
      if (pct < LOW_COMPLETION_PCT) {
        lowCompletion.push({
          key: `lc-${s.school_id}`,
          href,
          primary: s.school_name,
          secondary: `${Math.round(pct)}% · ${done}/${assigned}`,
          sort: pct,
        });
      }
    }
    lowCompletion.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

    // Teachers to follow up: have work assigned but are behind on it. Completion is
    // the reliable signal (a teacher well into their lessons is clearly engaged even
    // if our login tracking hasn't caught up), so we lead with it and use sign-in
    // recency only as extra colour.
    const followUp: Item[] = [];
    for (const t of teachers) {
      const assigned = num(t.total_lessons_assigned);
      if (assigned === 0) continue;
      const pct = num(t.avg_completion_pct);
      if (pct >= TEACHER_BEHIND_PCT) continue;

      const logins = num(t.login_count);
      const done = num(t.total_lessons_completed);
      const name = t.teacher_name ?? `Teacher ${t.person_id}`;
      const school = t.school_name ? ` · ${t.school_name}` : "";

      let secondary: string;
      if (done === 0 && logins === 0) secondary = "Not started";
      else secondary = `${Math.round(pct)}% · ${done}/${assigned}`;

      const d = logins > 0 ? daysSince(t.last_login_at) : null;
      if (d !== null && d >= INACTIVE_DAYS) secondary += ` · ${d}d since login`;

      followUp.push({ key: `fu-${t.person_id}`, href: `/teachers/${t.person_id}`, primary: name + school, secondary, sort: pct });
    }
    followUp.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

    const total = notStarted.length + lowCompletion.length + followUp.length;
    return { notStarted, lowCompletion, followUp, notSetUp, total };
  }, [schools, teachers]);

  const clear = signals.total === 0;

  return (
    <section className="mb-6 rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span style={{ color: clear ? "var(--status-success)" : "var(--brand-gold)" }}>
          {clear ? <CheckIcon /> : <BellIcon />}
        </span>
        <h2 className="text-base font-semibold">Attention needed</h2>
        {!clear && (
          <span
            className="rounded-full px-2 py-0.5 text-[12px] font-semibold"
            style={{
              color: "var(--brand-gold)",
              backgroundColor: "color-mix(in srgb, var(--brand-gold) 12%, transparent)",
            }}
          >
            {signals.total}
          </span>
        )}
      </div>

      {clear ? (
        <p className="mt-3 text-[13px] text-[var(--on-surface-variant)]">
          Nothing needs following up right now — every school with assigned lessons is on track and teachers are
          signing in.
        </p>
      ) : (
        <>
          <p className="mt-1 text-[13px] text-[var(--on-surface-variant)]">
            A quick read on where to focus. Everything here links straight to the school or teacher.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
            <Section title="Not started yet" color="var(--status-danger)" items={signals.notStarted} moreHref="/dashboard" />
            <Section title="Low completion" color="var(--status-warning)" items={signals.lowCompletion} moreHref="/dashboard" />
            <Section title="Teachers to follow up" color="var(--chart-teacher, var(--brand-gold))" items={signals.followUp} moreHref="/teachers" />
          </div>
        </>
      )}

      {signals.notSetUp > 0 && (
        <p className="mt-5 border-t border-[var(--brand-border)] pt-3 text-[12px] text-[var(--on-surface-variant)]">
          {signals.notSetUp} school{signals.notSetUp === 1 ? "" : "s"} {signals.notSetUp === 1 ? "has" : "have"} no
          courses assigned yet.
          {canManage && (
            <>
              {" "}
              <Link href="/manage/courses" className="font-medium text-[var(--brand-gold)] hover:underline">
                Assign courses →
              </Link>
            </>
          )}
        </p>
      )}
    </section>
  );
}
