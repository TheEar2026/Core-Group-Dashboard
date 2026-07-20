"use client";

import { useActionState } from "react";
import { createSchoolAdminAction } from "../logins/admin-actions";
import type { ActionState } from "../courses/actions";

export type SchoolOption = { id: number; school_name: string };
export type SchoolAdminRow = { email: string | null; school_name: string | null; created_at: string };

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

export function SchoolAdminsManager({ schools, admins }: { schools: SchoolOption[]; admins: SchoolAdminRow[] }) {
  const [state, action, pending] = useActionState(createSchoolAdminAction, undefined);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6 lg:col-span-1">
        <h2 className="mb-4 text-base font-semibold">New school-admin login</h2>
        <form action={action} className="space-y-3">
          <div>
            <label className={LABEL} htmlFor="email">Login email</label>
            <input id="email" name="email" type="email" className={INPUT} placeholder="admin@school.com" required />
          </div>
          <div>
            <label className={LABEL} htmlFor="password">Temporary password</label>
            <input id="password" name="password" className={INPUT} placeholder="At least 8 characters" minLength={8} required />
          </div>
          <div>
            <label className={LABEL} htmlFor="schoolId">Home school</label>
            <select id="schoolId" name="schoolId" className={INPUT} defaultValue="" required>
              <option value="">— pick a school —</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.school_name}</option>)}
            </select>
          </div>
          <button type="submit" className={BTN} disabled={pending}>{pending ? "Creating…" : "Create login"}</button>
          <Feedback state={state} />
        </form>
      </div>

      <div className="lg:col-span-2">
        {admins.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--brand-border)] bg-[var(--surface)] p-12 text-center text-sm text-[var(--on-surface-variant)]">
            No school admins yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--brand-border)] bg-[var(--surface)]">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--brand-border)]" style={{ backgroundColor: "var(--brand-header-tint)" }}>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">Email</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">Home school</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--brand-border)]">
                {admins.map((a, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 font-medium">{a.email ?? "—"}</td>
                    <td className="px-4 py-3 text-[var(--on-surface-variant)]">{a.school_name ?? "—"}</td>
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
