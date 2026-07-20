"use client";

import { useActionState } from "react";
import { addLessonAction, type ActionState } from "../../../actions";

export type LessonRow = { module_id: number; lesson_id: number; title: string; sort_order: number };

const INPUT =
  "w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-2 text-sm outline-none transition-all focus:border-[var(--brand-gold)] focus:shadow-[0_0_0_2px_rgba(168,136,76,0.15)]";
const LABEL = "block text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)] mb-1";
const BTN =
  "rounded-lg bg-[var(--brand-gold)] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[var(--brand-gold-hover)] active:scale-[0.98] disabled:opacity-60";

function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  const color = state.ok ? "var(--status-success)" : "var(--status-danger)";
  return (
    <p role="status" className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ color, backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}>
      {state.message}
    </p>
  );
}

export function ModuleLessons({ courseId, moduleId, lessons }: { courseId: number; moduleId: number; lessons: LessonRow[] }) {
  const [state, action, pending] = useActionState(addLessonAction, undefined);

  return (
    <div className="max-w-2xl rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
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
      <form action={action} className="flex items-end gap-2">
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="moduleId" value={moduleId} />
        <div className="flex-1">
          <label className={LABEL} htmlFor="lessonTitle">Add a lesson</label>
          <input id="lessonTitle" name="title" className={INPUT} placeholder="Lesson title" required />
        </div>
        <button type="submit" className={BTN} disabled={pending}>{pending ? "Adding…" : "Add"}</button>
      </form>
      <Feedback state={state} />
    </div>
  );
}
