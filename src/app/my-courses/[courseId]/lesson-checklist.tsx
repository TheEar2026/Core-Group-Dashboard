"use client";

import { useMemo, useState, useTransition } from "react";
import { toggleLesson } from "../actions";

export type LessonRow = {
  module_id: number;
  module_title: string;
  module_sort_order: number;
  lesson_id: number;
  title: string;
  sort_order: number;
  completed: boolean;
};

type Module = {
  module_id: number;
  module_title: string;
  lessons: { lesson_id: number; title: string; completed: boolean }[];
};

function groupByModule(rows: LessonRow[]): Module[] {
  const modules: Module[] = [];
  for (const r of rows) {
    let m = modules.find((m) => m.module_id === r.module_id);
    if (!m) {
      m = { module_id: r.module_id, module_title: r.module_title, lessons: [] };
      modules.push(m);
    }
    m.lessons.push({ lesson_id: r.lesson_id, title: r.title, completed: r.completed });
  }
  return modules;
}

export function LessonChecklist({ courseId, rows }: { courseId: number; rows: LessonRow[] }) {
  const initialModules = useMemo(() => groupByModule(rows), [rows]);
  const [modules, setModules] = useState(initialModules);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const allLessons = modules.flatMap((m) => m.lessons);
  const done = allLessons.filter((l) => l.completed).length;
  const total = allLessons.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  function toggle(lessonId: number, next: boolean) {
    setModules((prev) =>
      prev.map((m) => ({
        ...m,
        lessons: m.lessons.map((l) => (l.lesson_id === lessonId ? { ...l, completed: next } : l)),
      })),
    );
    setError(null);
    startTransition(async () => {
      const res = await toggleLesson(lessonId, courseId, next);
      if (!res.ok) {
        setModules((prev) =>
          prev.map((m) => ({
            ...m,
            lessons: m.lessons.map((l) => (l.lesson_id === lessonId ? { ...l, completed: !next } : l)),
          })),
        );
        setError(res.message ?? "Couldn't save that change.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Overall progress header */}
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

      {/* Modules, each with its own lesson checklist */}
      {modules.map((m) => {
        const mDone = m.lessons.filter((l) => l.completed).length;
        const mTotal = m.lessons.length;
        return (
          <div key={m.module_id} className="overflow-hidden rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--brand-border)] px-5 py-3" style={{ backgroundColor: "var(--brand-header-tint)" }}>
              <h2 className="text-[14px] font-semibold">{m.module_title}</h2>
              <span className="text-[12px] font-semibold text-[var(--on-surface-variant)]">
                {mDone} / {mTotal}
              </span>
            </div>
            <ul className="divide-y divide-[var(--brand-border)]">
              {m.lessons.map((l) => (
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
      })}
    </div>
  );
}
