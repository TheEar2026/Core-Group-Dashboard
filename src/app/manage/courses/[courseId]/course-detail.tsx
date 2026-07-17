"use client";

import { useActionState, useState, useTransition } from "react";
import { addLessonAction, assignTeacherAction, unassignTeacherAction, type ActionState } from "../actions";

export type Lesson = { lesson_id: number; title: string; sort_order: number; completed: boolean };
export type Teacher = { person_id: number; teacher_name: string | null; primary_email: string | null; school_name: string | null };

const INPUT =
  "w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-2 text-sm outline-none transition-all focus:border-[var(--brand-gold)] focus:shadow-[0_0_0_2px_rgba(168,136,76,0.15)]";
const LABEL = "block text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)] mb-1";
const BTN =
  "rounded-lg bg-[var(--brand-gold)] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[var(--brand-gold-hover)] active:scale-[0.98] disabled:opacity-60";
const CARD = "rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6";

function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  const color = state.ok ? "var(--status-success)" : "var(--status-danger)";
  return (
    <p role="status" className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ color, backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}>
      {state.message}
    </p>
  );
}

export function CourseDetail({
  courseId,
  lessons,
  assigned,
  allTeachers,
}: {
  courseId: number;
  lessons: Lesson[];
  assigned: Teacher[];
  allTeachers: Teacher[];
}) {
  const [lessonState, lessonAction, lessonPending] = useActionState(addLessonAction, undefined);
  const [assignState, assignFn, assignPending] = useActionState(assignTeacherAction, undefined);
  const [, startTransition] = useTransition();
  const [removeMsg, setRemoveMsg] = useState<string | null>(null);

  const assignedIds = new Set(assigned.map((t) => t.person_id));
  const available = allTeachers.filter((t) => !assignedIds.has(t.person_id));

  function remove(personId: number) {
    setRemoveMsg(null);
    startTransition(async () => {
      const r = await unassignTeacherAction(courseId, personId);
      if (r && !r.ok) setRemoveMsg(r.message);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Lessons */}
      <div className={CARD}>
        <h2 className="mb-4 text-base font-semibold">Lessons ({lessons.length})</h2>
        {lessons.length === 0 ? (
          <p className="mb-4 text-sm text-[var(--on-surface-variant)]">No lessons yet. Add them in order below.</p>
        ) : (
          <ol className="mb-4 divide-y divide-[var(--brand-border)] overflow-hidden rounded-lg border border-[var(--brand-border)]">
            {lessons.map((l, i) => (
              <li key={l.lesson_id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="w-5 text-right text-[var(--on-surface-variant)] tabular-nums">{i + 1}</span>
                <span>{l.title}</span>
              </li>
            ))}
          </ol>
        )}
        <form action={lessonAction} className="flex items-end gap-2">
          <input type="hidden" name="courseId" value={courseId} />
          <div className="flex-1">
            <label className={LABEL} htmlFor="lessonTitle">Add a lesson</label>
            <input id="lessonTitle" name="title" className={INPUT} placeholder="Lesson title" required />
          </div>
          <button type="submit" className={BTN} disabled={lessonPending}>{lessonPending ? "Adding…" : "Add"}</button>
        </form>
        <Feedback state={lessonState} />
      </div>

      {/* Teachers */}
      <div className={CARD}>
        <h2 className="mb-4 text-base font-semibold">Assigned teachers ({assigned.length})</h2>
        {assigned.length === 0 ? (
          <p className="mb-4 text-sm text-[var(--on-surface-variant)]">No teachers assigned yet.</p>
        ) : (
          <ul className="mb-4 divide-y divide-[var(--brand-border)] overflow-hidden rounded-lg border border-[var(--brand-border)]">
            {assigned.map((t) => (
              <li key={t.person_id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span>
                  {t.teacher_name ?? "—"}
                  {t.school_name && <span className="text-[var(--on-surface-variant)]"> · {t.school_name}</span>}
                </span>
                <button type="button" onClick={() => remove(t.person_id)} className="text-[13px] font-medium hover:underline" style={{ color: "var(--status-danger)" }}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <form action={assignFn} className="flex items-end gap-2">
          <input type="hidden" name="courseId" value={courseId} />
          <div className="flex-1">
            <label className={LABEL} htmlFor="personId">Assign a teacher</label>
            <select id="personId" name="personId" className={INPUT} defaultValue="">
              <option value="">— pick a teacher —</option>
              {available.map((t) => (
                <option key={t.person_id} value={t.person_id}>
                  {t.teacher_name ?? `Person ${t.person_id}`}{t.school_name ? ` (${t.school_name})` : ""}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={BTN} disabled={assignPending || available.length === 0}>
            {assignPending ? "Assigning…" : "Assign"}
          </button>
        </form>
        <Feedback state={assignState} />
        {removeMsg && (
          <p className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ color: "var(--status-danger)", backgroundColor: "color-mix(in srgb, var(--status-danger) 10%, transparent)" }}>
            {removeMsg}
          </p>
        )}
      </div>
    </div>
  );
}
