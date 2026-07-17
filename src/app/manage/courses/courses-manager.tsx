"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createCourseAction, type ActionState } from "./actions";

export type CourseRow = {
  course_id: number;
  grade: string | null;
  title: string;
  is_active: boolean;
  lessons_total: number | string | null;
  assigned_teachers: number | string | null;
};

const GRADES = ["Grade R", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7"];
const INPUT =
  "w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-2 text-sm outline-none transition-all focus:border-[var(--brand-gold)] focus:shadow-[0_0_0_2px_rgba(168,136,76,0.15)]";
const LABEL = "block text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)] mb-1";
const BTN =
  "rounded-lg bg-[var(--brand-gold)] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[var(--brand-gold-hover)] active:scale-[0.98] disabled:opacity-60";

function num(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isNaN(n) ? 0 : n;
}

function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  const color = state.ok ? "var(--status-success)" : "var(--status-danger)";
  return (
    <p role="status" className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ color, backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}>
      {state.message}
    </p>
  );
}

export function CoursesManager({ courses }: { courses: CourseRow[] }) {
  const [state, action, pending] = useActionState(createCourseAction, undefined);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Create course */}
      <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6 lg:col-span-1">
        <h2 className="mb-4 text-base font-semibold">New course</h2>
        <form action={action} className="space-y-3">
          <div>
            <label className={LABEL} htmlFor="grade">Grade</label>
            <select id="grade" name="grade" className={INPUT} defaultValue="">
              <option value="">— none —</option>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="title">Course title</label>
            <input id="title" name="title" className={INPUT} placeholder="e.g. Music Library" required />
          </div>
          <button type="submit" className={BTN} disabled={pending}>
            {pending ? "Creating…" : "Create course"}
          </button>
          <Feedback state={state} />
        </form>
      </div>

      {/* Course list */}
      <div className="lg:col-span-2">
        {courses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--brand-border)] bg-[var(--surface)] p-12 text-center text-sm text-[var(--on-surface-variant)]">
            No courses yet. Create your first one on the left.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {courses.map((c) => (
              <Link
                key={c.course_id}
                href={`/manage/courses/${c.course_id}`}
                className="group block rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-5 transition-all hover:border-[var(--brand-gold)] hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {c.grade && (
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ color: "var(--brand-gold)", backgroundColor: "color-mix(in srgb, var(--brand-gold) 14%, transparent)" }}>
                        {c.grade}
                      </span>
                    )}
                    <p className="mt-2 font-semibold group-hover:text-[var(--brand-gold)]">{c.title}</p>
                  </div>
                  <span className="text-[var(--on-surface-variant)] group-hover:text-[var(--brand-gold)]" aria-hidden>→</span>
                </div>
                <p className="mt-3 text-[13px] text-[var(--on-surface-variant)]">
                  {num(c.lessons_total)} lesson{num(c.lessons_total) === 1 ? "" : "s"} · {num(c.assigned_teachers)} teacher{num(c.assigned_teachers) === 1 ? "" : "s"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
