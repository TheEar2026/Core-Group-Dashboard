"use client";

import { useActionState, useMemo, useState } from "react";
import { createTeacherLoginAction, type ActionState } from "../courses/actions";

export type TeacherLoginRow = {
  person_id: number;
  teacher_name: string | null;
  primary_email: string | null;
  school_name: string | null;
  has_login: boolean;
};

const INPUT =
  "w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-2 text-sm outline-none transition-all focus:border-[var(--brand-gold)] focus:shadow-[0_0_0_2px_rgba(168,136,76,0.15)]";
const LABEL = "block text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)] mb-1";
const BTN =
  "rounded-lg bg-[var(--brand-gold)] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[var(--brand-gold-hover)] active:scale-[0.98] disabled:opacity-60";

export function LoginsManager({ teachers }: { teachers: TeacherLoginRow[] }) {
  const [state, action, pending] = useActionState(createTeacherLoginAction, undefined);
  const withoutLogin = useMemo(() => teachers.filter((t) => !t.has_login), [teachers]);
  const [selected, setSelected] = useState<string>("");

  const selectedTeacher = teachers.find((t) => String(t.person_id) === selected);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Create login */}
      <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6 lg:col-span-1">
        <h2 className="mb-4 text-base font-semibold">New teacher login</h2>
        <form action={action} className="space-y-3">
          <div>
            <label className={LABEL} htmlFor="personId">Teacher</label>
            <select
              id="personId"
              name="personId"
              className={INPUT}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              required
            >
              <option value="">— pick a teacher —</option>
              {withoutLogin.map((t) => (
                <option key={t.person_id} value={t.person_id}>
                  {t.teacher_name ?? `Person ${t.person_id}`}{t.school_name ? ` (${t.school_name})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="email">Login email</label>
            <input
              id="email"
              name="email"
              type="email"
              className={INPUT}
              placeholder="teacher@school.com"
              defaultValue={selectedTeacher?.primary_email ?? ""}
              key={selected}
              required
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="password">Temporary password</label>
            <input id="password" name="password" className={INPUT} placeholder="At least 8 characters" minLength={8} required />
          </div>
          <button type="submit" className={BTN} disabled={pending || withoutLogin.length === 0}>
            {pending ? "Creating…" : "Create login"}
          </button>
          {state && (
            <p
              role="status"
              className="mt-1 rounded-lg px-3 py-2 text-sm"
              style={{
                color: state.ok ? "var(--status-success)" : "var(--status-danger)",
                backgroundColor: `color-mix(in srgb, ${state.ok ? "var(--status-success)" : "var(--status-danger)"} 10%, transparent)`,
              }}
            >
              {state.message}
            </p>
          )}
        </form>
      </div>

      {/* Teacher list */}
      <div className="lg:col-span-2">
        {teachers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--brand-border)] bg-[var(--surface)] p-12 text-center text-sm text-[var(--on-surface-variant)]">
            No teachers yet. People with the role “teacher” appear here.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--brand-border)] bg-[var(--surface)]">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--brand-border)]" style={{ backgroundColor: "var(--brand-header-tint)" }}>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">Teacher</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">School</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">Login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--brand-border)]">
                {teachers.map((t) => (
                  <tr key={t.person_id}>
                    <td className="px-4 py-3 font-medium">{t.teacher_name ?? "—"}</td>
                    <td className="px-4 py-3 text-[var(--on-surface-variant)]">{t.school_name ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {t.has_login ? (
                        <span className="text-[12px] font-bold" style={{ color: "var(--status-success)" }}>Active</span>
                      ) : (
                        <span className="text-[12px] text-[var(--on-surface-variant)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
