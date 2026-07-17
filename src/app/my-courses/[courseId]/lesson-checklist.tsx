"use client";

import { useState, useTransition } from "react";
import { toggleLesson } from "../actions";

export type Lesson = {
  lesson_id: number;
  title: string;
  sort_order: number;
  completed: boolean;
};

export function LessonChecklist({ courseId, lessons }: { courseId: number; lessons: Lesson[] }) {
  const [state, setState] = useState(() => lessons.map((l) => ({ ...l })));
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const done = state.filter((l) => l.completed).length;
  const total = state.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  function toggle(lessonId: number, next: boolean) {
    // Optimistic update.
    setState((prev) => prev.map((l) => (l.lesson_id === lessonId ? { ...l, completed: next } : l)));
    setError(null);
    startTransition(async () => {
      const res = await toggleLesson(lessonId, courseId, next);
      if (!res.ok) {
        // Roll back on failure.
        setState((prev) => prev.map((l) => (l.lesson_id === lessonId ? { ...l, completed: !next } : l)));
        setError(res.message ?? "Couldn't save that change.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-5 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[var(--on-surface-variant)]">
            {done} of {total} lessons completed
          </span>
          <span className="text-[20px] font-bold tracking-[-0.02em]">{pct}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--brand-header-tint)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: "var(--brand-gold)" }} />
        </div>
      </div>

      {error && (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ color: "var(--status-danger)", backgroundColor: "color-mix(in srgb, var(--status-danger) 10%, transparent)" }}>
          {error}
        </p>
      )}

      {/* Lesson list */}
      <ul className="overflow-hidden rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] shadow-sm divide-y divide-[var(--brand-border)]">
        {state.map((l) => (
          <li key={l.lesson_id}>
            <label className="flex cursor-pointer items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--brand-bg)]">
              <input
                type="checkbox"
                checked={l.completed}
                onChange={(e) => toggle(l.lesson_id, e.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all"
                style={{
                  borderColor: l.completed ? "var(--brand-gold)" : "var(--brand-border)",
                  backgroundColor: l.completed ? "var(--brand-gold)" : "transparent",
                }}
              >
                {l.completed && (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M13.5 4.5 6.5 11.5 3 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span
                className="text-[14px]"
                style={l.completed ? { color: "var(--on-surface-variant)", textDecoration: "line-through" } : undefined}
              >
                {l.title}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
