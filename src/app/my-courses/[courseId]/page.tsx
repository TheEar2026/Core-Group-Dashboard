import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { LessonChecklist, type Lesson } from "./lesson-checklist";

type MyCourse = {
  course_id: number;
  grade: string | null;
  title: string;
};

export default async function CourseLessonsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const id = Number(courseId);
  if (!Number.isInteger(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: role } = await supabase.rpc("get_my_role");
  if (role !== "teacher") {
    redirect("/analytics");
  }

  const [coursesRes, lessonsRes] = await Promise.all([
    supabase.rpc("get_my_courses"),
    supabase.rpc("get_course_lessons", { p_course_id: id }),
  ]);

  const course = ((coursesRes.data ?? []) as MyCourse[]).find((c) => c.course_id === id);
  if (!course) notFound();

  const lessons = (lessonsRes.data ?? []) as Lesson[];

  return (
    <AppShell email={user?.email} role={role}>
      <Link href="/my-courses" className="mb-4 inline-block text-sm font-medium" style={{ color: "var(--brand-gold)" }}>
        ← Back to My Courses
      </Link>

      <header className="mb-8">
        {course.grade && (
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold"
            style={{ color: "var(--brand-gold)", backgroundColor: "color-mix(in srgb, var(--brand-gold) 14%, transparent)" }}
          >
            {course.grade}
          </span>
        )}
        <h1 className="mt-2 text-[30px] font-bold tracking-[-0.02em]">{course.title}</h1>
      </header>

      {lessons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--brand-border)] bg-[var(--surface)] p-12 text-center text-sm text-[var(--on-surface-variant)]">
          No lessons have been added to this course yet.
        </div>
      ) : (
        <LessonChecklist courseId={id} lessons={lessons} />
      )}
    </AppShell>
  );
}
