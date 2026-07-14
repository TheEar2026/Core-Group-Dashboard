"use client";

import { useActionState } from "react";
import {
  createSchoolAction,
  createTeacherAction,
  assignSchoolAction,
  assignCourseAction,
  type ActionState,
} from "./actions";

export type SchoolOption = { id: number; school_name: string };
export type TeacherOption = {
  id: number;
  teacher_name: string | null;
  primary_email: string | null;
  school_id: number | null;
  school_name: string | null;
};
export type AssignmentRow = {
  id: number;
  teacher_name: string | null;
  school_name: string | null;
  grade: string | null;
  course_title: string | null;
};

const INPUT =
  "w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-2 text-sm outline-none transition-all placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--brand-gold)] focus:shadow-[0_0_0_2px_rgba(168,136,76,0.15)]";
const LABEL = "block text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)] mb-1";
const CARD = "rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6";
const BTN =
  "rounded-lg bg-[var(--brand-gold)] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[var(--brand-gold-hover)] active:scale-[0.98] disabled:opacity-60";

function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  const color = state.ok ? "var(--status-success)" : "var(--status-danger)";
  return (
    <p
      role="status"
      className="mt-3 rounded-lg px-3 py-2 text-sm"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}
    >
      {state.message}
    </p>
  );
}

export function ManageForms({
  schools,
  teachers,
  assignments,
}: {
  schools: SchoolOption[];
  teachers: TeacherOption[];
  assignments: AssignmentRow[];
}) {
  const [schoolState, schoolAction, schoolPending] = useActionState(createSchoolAction, undefined);
  const [teacherState, teacherAction, teacherPending] = useActionState(createTeacherAction, undefined);
  const [assignSchoolState, assignSchoolFn, assignSchoolPending] = useActionState(assignSchoolAction, undefined);
  const [assignCourseState, assignCourseFn, assignCoursePending] = useActionState(assignCourseAction, undefined);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Create school */}
        <section className={CARD}>
          <h2 className="mb-4 text-base font-semibold">Create school</h2>
          <form action={schoolAction} className="space-y-3">
            <div>
              <label className={LABEL} htmlFor="school_name">School name</label>
              <input id="school_name" name="school_name" required className={INPUT} placeholder="e.g. Riverside High" />
            </div>
            <div>
              <label className={LABEL} htmlFor="drived_core_id">Drived Core ID (optional)</label>
              <input id="drived_core_id" name="drived_core_id" inputMode="numeric" className={INPUT} placeholder="Numeric tenant ID" />
            </div>
            <button type="submit" disabled={schoolPending} className={BTN}>
              {schoolPending ? "Creating…" : "Create school"}
            </button>
            <Feedback state={schoolState} />
          </form>
        </section>

        {/* Create teacher */}
        <section className={CARD}>
          <h2 className="mb-4 text-base font-semibold">Create teacher</h2>
          <form action={teacherAction} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL} htmlFor="first_name">First name</label>
                <input id="first_name" name="first_name" required className={INPUT} />
              </div>
              <div>
                <label className={LABEL} htmlFor="surname">Surname</label>
                <input id="surname" name="surname" required className={INPUT} />
              </div>
            </div>
            <div>
              <label className={LABEL} htmlFor="t_email">Email (optional)</label>
              <input id="t_email" name="primary_email" type="email" className={INPUT} placeholder="teacher@school.edu" />
            </div>
            <div>
              <label className={LABEL} htmlFor="t_school">School (optional)</label>
              <select id="t_school" name="school_id" className={INPUT} defaultValue="">
                <option value="">— Unassigned —</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.school_name}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={teacherPending} className={BTN}>
              {teacherPending ? "Creating…" : "Create teacher"}
            </button>
            <Feedback state={teacherState} />
          </form>
        </section>

        {/* Assign teacher to school */}
        <section className={CARD}>
          <h2 className="mb-4 text-base font-semibold">Assign teacher to a school</h2>
          <form action={assignSchoolFn} className="space-y-3">
            <div>
              <label className={LABEL} htmlFor="as_person">Teacher</label>
              <select id="as_person" name="person_id" required className={INPUT} defaultValue="">
                <option value="" disabled>Choose a teacher</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.teacher_name ?? "Unnamed"}{t.school_name ? ` — ${t.school_name}` : " — unassigned"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="as_school">School</label>
              <select id="as_school" name="school_id" className={INPUT} defaultValue="">
                <option value="">— Unassign —</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.school_name}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={assignSchoolPending} className={BTN}>
              {assignSchoolPending ? "Saving…" : "Update school"}
            </button>
            <Feedback state={assignSchoolState} />
          </form>
        </section>

        {/* Assign course */}
        <section className={CARD}>
          <h2 className="mb-4 text-base font-semibold">Assign a course</h2>
          <form action={assignCourseFn} className="space-y-3">
            <div>
              <label className={LABEL} htmlFor="ac_person">Teacher</label>
              <select id="ac_person" name="person_id" required className={INPUT} defaultValue="">
                <option value="" disabled>Choose a teacher</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.teacher_name ?? "Unnamed"}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="ac_school">School</label>
              <select id="ac_school" name="school_id" required className={INPUT} defaultValue="">
                <option value="" disabled>Choose a school</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.school_name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL} htmlFor="ac_grade">Grade</label>
                <input id="ac_grade" name="grade" required className={INPUT} placeholder="e.g. Grade 6" />
              </div>
              <div>
                <label className={LABEL} htmlFor="ac_course">Course title</label>
                <input id="ac_course" name="course_title" required className={INPUT} placeholder="e.g. Music Library" />
              </div>
            </div>
            <button type="submit" disabled={assignCoursePending} className={BTN}>
              {assignCoursePending ? "Assigning…" : "Assign course"}
            </button>
            <Feedback state={assignCourseState} />
          </form>
        </section>
      </div>

      {/* Current assignments */}
      <section className="overflow-hidden rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] shadow-sm">
        <div className="border-b border-[var(--brand-border)] px-4 py-3">
          <h2 className="text-base font-semibold">Current course assignments</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--brand-border)]" style={{ backgroundColor: "var(--brand-header-tint)" }}>
                <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--on-surface-variant)]">Teacher</th>
                <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--on-surface-variant)]">School</th>
                <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--on-surface-variant)]">Grade</th>
                <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--on-surface-variant)]">Course</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--brand-border)]">
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 text-[13px] font-semibold" style={{ color: "var(--brand-gold)" }}>{a.teacher_name ?? "—"}</td>
                  <td className="px-4 py-3 text-[13px]">{a.school_name ?? "—"}</td>
                  <td className="px-4 py-3 text-[13px]">{a.grade ?? "—"}</td>
                  <td className="px-4 py-3 text-[13px]">{a.course_title ?? "—"}</td>
                </tr>
              ))}
              {assignments.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-[var(--on-surface-variant)]">
                    No course assignments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
