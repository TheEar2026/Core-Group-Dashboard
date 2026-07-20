"use client";

import { useMemo, useState, useTransition } from "react";
import { toggleLesson } from "../actions";

type Lesson = { lesson_id: number; title: string; completed: boolean };
type Module = { module_id: number; module_title: string; lessons: Lesson[] };
export type CourseGroup = { course_id: number; grade: string | null; title: string; modules: Module[] };

export function ProgressOverview({ groups: initialGroups }: { groups: CourseGroup[] }) {
  const [groups, setGroups] = useState(initialGroups);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const overall = useMemo(() => {
    const allLessons = groups.flatMap((g) => g.modules.flatMap((m) => m.lessons));
    const done = allLessons.filter((l) => l.completed).length;
    const total = allLessons.length;
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [groups]);

  function toggle(courseId: number, lessonId: number, next: boolean) {
    setGroups((prev) =>
      prev.map((g) =>
        g.course_id !== courseId
          ? g
          : {
              ...g,
              modules: g.modules.map((m) => ({
                ...m,
                lessons: m.lessons.map((l) => (l.lesson_id === lessonId ? { ...l, completed: next } : l)),
              })),
            },
      ),
    );
    setError(null);
    startTransition(async () => {
      const res = await toggleLesson(lessonId, courseId, next);
      if (!res.ok) {
        setGroups((prev) =>
          prev.map((g) =>
            g.course_id !== courseId
              ? g
              : {
                  ...g,
                  modules: g.modules.map((m) => ({
                    ...m,
                    lessons: m.lessons.map((l) => (l.lesson_id === lessonId ? { ...l, completed: !next } : l)),
                  })),
                },
          ),
        );
        setError(res.message ?? "Couldn't save that change.");
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* Overall progress */}
      <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-5 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[var(--on-surface-variant)]">
            {overall.done} of {overall.total} lessons completed across {groups.length} course{groups.length === 1 ? "" : "s"}
          </span>
          <span className="text-[20px] font-bold tracking-[-0.02em]">{overall.pct}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--brand-header-tint)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${overall.pct}%`, backgroundColor: "var(--brand-gold)" }} />
        </div>
      </div>

      {error && (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ color: "var(--status-danger)", backgroundColor: "color-mix(in srgb, var(--status-danger) 10%, transparent)" }}>
          {error}
        </p>
      )}

      {/* One section per course */}
      {groups.map((g) => {
        const courseLessons = g.modules.flatMap((m) => m.lessons);
        const courseDone = courseLessons.filter((l) => l.completed).length;
        const courseTotal = courseLessons.length;
        const coursePct = courseTotal > 0 ? Math.round((courseDone / courseTotal) * 100) : 0;

        return (
          <section key={g.course_id} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {g.grade && (
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                    style={{ color: "var(--brand-gold)", backgroundColor: "color-mix(in srgb, var(--brand-gold) 14%, transparent)" }}
                  >
                    {g.grade}
                  </span>
                )}
                <h2 className="text-[20px] font-bold tracking-[-0.01em]">{g.title}</h2>
              </div>
              <span className="text-[13px] font-semibold text-[var(--on-surface-variant)]">
                {courseDone} / {courseTotal} · {coursePct}%
              </span>
            </div>

            {g.modules.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--brand-border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--on-surface-variant)]">
                No lessons have been added to this course yet.
              </p>
            ) : (
              <div className="space-y-3">
                {g.modules.map((m) => {
                  const mDone = m.lessons.filter((l) => l.completed).length;
                  const mTotal = m.lessons.length;
                  return (
                    <div key={m.module_id} className="overflow-hidden rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] shadow-sm">
                      <div className="flex items-center justify-between gap-3 border-b border-[var(--brand-border)] px-5 py-3" style={{ backgroundColor: "var(--brand-header-tint)" }}>
                        <h3 className="text-[14px] font-semibold">{m.module_title}</h3>
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
                                onChange={(e) => toggle(g.course_id, l.lesson_id, e.target.checked)}
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
            )}
          </section>
        );
      })}
    </div>
  );
}
