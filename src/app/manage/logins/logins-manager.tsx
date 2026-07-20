"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { createTeacherLoginAction, type ActionState } from "../courses/actions";
import { bulkCreateTeacherLoginsAction, type BulkResult } from "./admin-actions";

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
  const withEmail = useMemo(() => withoutLogin.filter((t) => t.primary_email), [withoutLogin]);
  const [selected, setSelected] = useState<string>("");
  const [bulk, setBulk] = useState<BulkResult>(undefined);
  const [bulkPending, startBulk] = useTransition();

  const selectedTeacher = teachers.find((t) => String(t.person_id) === selected);

  function runBulk() {
    setBulk(undefined);
    startBulk(async () => setBulk(await bulkCreateTeacherLoginsAction()));
  }

  function downloadCsv() {
    if (!bulk?.created?.length) return;
    const rows = [["Teacher", "Email", "Temporary password"], ...bulk.created.map((r) => [r.name, r.email, r.password])];
    const csv = rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "teacher-logins.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Bulk create */}
      <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Bulk create</h2>
            <p className="mt-0.5 text-[13px] text-[var(--on-surface-variant)]">
              Create logins for all {withEmail.length} teacher{withEmail.length === 1 ? "" : "s"} without one, with
              auto-generated temporary passwords. Download the list to hand out.
            </p>
          </div>
          <button
            type="button"
            onClick={runBulk}
            disabled={bulkPending || withEmail.length === 0}
            className="rounded-lg bg-[var(--brand-gold)] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[var(--brand-gold-hover)] active:scale-[0.98] disabled:opacity-60"
          >
            {bulkPending ? "Creating…" : `Create ${withEmail.length} login${withEmail.length === 1 ? "" : "s"}`}
          </button>
        </div>

        {bulk && (
          <div className="mt-4 space-y-3">
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                color: bulk.ok ? "var(--status-success)" : "var(--status-danger)",
                backgroundColor: `color-mix(in srgb, ${bulk.ok ? "var(--status-success)" : "var(--status-danger)"} 10%, transparent)`,
              }}
            >
              {bulk.message}
            </p>
            {bulk.created.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold">
                    {bulk.created.length} login{bulk.created.length === 1 ? "" : "s"} created — copy these now, passwords aren&apos;t shown again.
                  </p>
                  <button type="button" onClick={downloadCsv} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-[13px] font-medium hover:bg-[var(--brand-bg)]">
                    Download CSV
                  </button>
                </div>
                <div className="overflow-hidden rounded-lg border border-[var(--brand-border)]">
                  <table className="w-full border-collapse text-left text-[13px]">
                    <thead>
                      <tr style={{ backgroundColor: "var(--brand-header-tint)" }}>
                        <th className="px-3 py-2 font-semibold">Teacher</th>
                        <th className="px-3 py-2 font-semibold">Email</th>
                        <th className="px-3 py-2 font-semibold">Temp password</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--brand-border)]">
                      {bulk.created.map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2">{r.name}</td>
                          <td className="px-3 py-2">{r.email}</td>
                          <td className="px-3 py-2 font-mono">{r.password}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {bulk.skipped.length > 0 && (
              <p className="text-[13px] text-[var(--on-surface-variant)]">
                Skipped: {bulk.skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}
              </p>
            )}
          </div>
        )}
      </div>

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
    </div>
  );
}
