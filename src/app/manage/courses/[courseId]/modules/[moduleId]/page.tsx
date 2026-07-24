import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { ModuleLessons, type LessonRow } from "./module-lessons";
import type { CourseRow } from "../../../courses-manager";

export default async function ManageModuleDetailPage({
  params,
}: {
  params: Promise<{ courseId: string; moduleId: string }>;
}) {
  const { courseId, moduleId } = await params;
  const cId = Number(courseId);
  const mId = Number(moduleId);
  if (!Number.isInteger(cId) || !Number.isInteger(mId)) notFound();

  const supabase = await createClient();
  const [{ data: { user } }, { data: role }, coursesRes, lessonsRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_my_role"),
    supabase.rpc("admin_list_courses"),
    // get_course_lessons is grouped by module; filter to this one below.
    supabase.rpc("get_course_lessons", { p_course_id: cId }),
  ]);
  if (role !== "super_admin") redirect("/analytics");

  const course = ((coursesRes.data ?? []) as CourseRow[]).find((c) => c.course_id === cId);
  if (!course) notFound();

  const allRows = (lessonsRes.data ?? []) as (LessonRow & { module_title: string })[];
  const moduleRows = allRows.filter((r) => r.module_id === mId);
  const moduleTitle = moduleRows[0]?.module_title ?? "Module";

  return (
    <AppShell email={user?.email} role={role}>
      <Link href={`/manage/courses/${cId}`} className="mb-4 inline-block text-sm font-medium" style={{ color: "var(--brand-gold)" }}>
        ← {course.title}
      </Link>
      <header className="mb-8">
        <p className="text-[13px] font-semibold text-[var(--on-surface-variant)]">{course.title}</p>
        <h1 className="mt-1 text-[30px] font-bold tracking-[-0.02em]">{moduleTitle}</h1>
      </header>

      <ModuleLessons courseId={cId} moduleId={mId} lessons={moduleRows} />
    </AppShell>
  );
}
