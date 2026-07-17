import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { CourseDetail, type Lesson, type Teacher } from "./course-detail";
import type { CourseRow } from "../courses-manager";

export default async function ManageCourseDetailPage({
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
  if (role !== "super_admin") redirect("/analytics");

  const [coursesRes, lessonsRes, assignedRes, allTeachersRes] = await Promise.all([
    supabase.rpc("admin_list_courses"),
    supabase.rpc("get_course_lessons", { p_course_id: id }),
    supabase.rpc("admin_list_course_teachers", { p_course_id: id }),
    supabase.rpc("admin_list_teachers"),
  ]);

  const course = ((coursesRes.data ?? []) as CourseRow[]).find((c) => c.course_id === id);
  if (!course) notFound();

  const lessons = (lessonsRes.data ?? []) as Lesson[];
  const assigned = (assignedRes.data ?? []) as Teacher[];
  const allTeachers = ((allTeachersRes.data ?? []) as { id: number; teacher_name: string | null; school_name: string | null }[]).map(
    (t) => ({ person_id: t.id, teacher_name: t.teacher_name, primary_email: null, school_name: t.school_name }),
  );

  return (
    <AppShell email={user?.email} role={role}>
      <Link href="/manage/courses" className="mb-4 inline-block text-sm font-medium" style={{ color: "var(--brand-gold)" }}>
        ← Courses &amp; lessons
      </Link>
      <header className="mb-8">
        {course.grade && (
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ color: "var(--brand-gold)", backgroundColor: "color-mix(in srgb, var(--brand-gold) 14%, transparent)" }}>
            {course.grade}
          </span>
        )}
        <h1 className="mt-2 text-[30px] font-bold tracking-[-0.02em]">{course.title}</h1>
      </header>

      <CourseDetail courseId={id} lessons={lessons} assigned={assigned} allTeachers={allTeachers} />
    </AppShell>
  );
}
