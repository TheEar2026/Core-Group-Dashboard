import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { ProgressOverview, type CourseGroup } from "./progress-overview";

type MyCourse = { course_id: number; grade: string | null; title: string };

type LessonRow = {
  module_id: number;
  module_title: string;
  module_sort_order: number;
  lesson_id: number;
  title: string;
  sort_order: number;
  completed: boolean;
};

export default async function LessonProgressPage() {
  const supabase = await createClient();
  // Wave 1: auth, role and the course list in parallel. (The per-lesson
  // fetches below genuinely depend on the returned course ids, so they form
  // a second wave.)
  const [{ data: { user } }, { data: role }, { data: coursesData, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_my_role"),
    supabase.rpc("get_my_courses"),
  ]);
  if (role !== "teacher") {
    redirect("/analytics");
  }

  const courses = (coursesData ?? []) as MyCourse[];

  const lessonResults = await Promise.all(
    courses.map((c) => supabase.rpc("get_course_lessons", { p_course_id: c.course_id })),
  );

  const groups: CourseGroup[] = courses.map((c, i) => {
    const rows = (lessonResults[i].data ?? []) as LessonRow[];
    const moduleMap = new Map<number, { module_id: number; module_title: string; lessons: { lesson_id: number; title: string; completed: boolean }[] }>();
    for (const r of rows) {
      let m = moduleMap.get(r.module_id);
      if (!m) {
        m = { module_id: r.module_id, module_title: r.module_title, lessons: [] };
        moduleMap.set(r.module_id, m);
      }
      m.lessons.push({ lesson_id: r.lesson_id, title: r.title, completed: r.completed });
    }
    return {
      course_id: c.course_id,
      grade: c.grade,
      title: c.title,
      modules: Array.from(moduleMap.values()),
    };
  });

  return (
    <AppShell email={user?.email} role={role}>
      <header className="mb-8">
        <h1 className="text-[30px] font-bold tracking-[-0.02em]">Lesson Progress</h1>
        <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
          Every course, module and lesson you&apos;re assigned, all on one page. Tick lessons off here
          or from My Courses — they stay in sync.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-lg border p-3 text-sm"
          style={{
            color: "var(--status-danger)",
            borderColor: "color-mix(in srgb, var(--status-danger) 20%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--status-danger) 8%, transparent)",
          }}
        >
          Couldn&apos;t load your progress: {error.message}
        </div>
      )}

      {!error && groups.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--brand-border)] bg-[var(--surface)] p-12 text-center text-sm text-[var(--on-surface-variant)]">
          No courses have been assigned to you yet.
        </div>
      )}

      {groups.length > 0 && <ProgressOverview groups={groups} />}
    </AppShell>
  );
}
