"use client";

import { useActionState } from "react";
import {
  createTeacherFromQueue,
  linkQueueToExisting,
  createAllPending,
  backfillPfSchools,
  type BulkState,
} from "./actions";

export type QueueItem = {
  id: number;
  source_system: string;
  raw_identifier: string;
  suggested_name: string;
  detected_school_id: number | null;
  detected_school_name: string | null;
  fact_rows: number | string | null;
};

export type PersonOption = { id: number; teacher_name: string | null };

const BTN =
  "rounded-lg bg-[var(--brand-gold)] px-3 py-1.5 text-sm font-semibold text-white transition-all hover:bg-[var(--brand-gold-hover)] active:scale-[0.98] disabled:opacity-60";
const BTN_SECONDARY =
  "rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-medium transition-all hover:bg-[var(--brand-bg)] active:scale-95";
const SELECT =
  "rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2 py-1.5 text-sm outline-none focus:border-[var(--brand-gold)]";

function Bulk({
  action,
  initialLabel,
  className,
}: {
  action: (prev: BulkState) => Promise<BulkState>;
  initialLabel: string;
  className: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <button type="submit" disabled={pending} className={className}>
        {pending ? "Working…" : initialLabel}
      </button>
      {state && (
        <span
          className="text-sm"
          style={{ color: state.ok ? "var(--status-success)" : "var(--status-danger)" }}
        >
          {state.message}
        </span>
      )}
    </form>
  );
}

export function MatchesReview({
  items,
  people,
}: {
  items: QueueItem[];
  people: PersonOption[];
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-4">
        <Bulk action={createAllPending} initialLabel="Create all pending as teachers" className={BTN} />
        <Bulk action={backfillPfSchools} initialLabel="Backfill Product Fruits schools" className={BTN_SECONDARY} />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] shadow-sm">
        <div className="border-b border-[var(--brand-border)] px-4 py-3">
          <h2 className="text-base font-semibold">
            Pending matches{items.length > 0 ? ` (${items.length})` : ""}
          </h2>
          <p className="mt-0.5 text-[13px] text-[var(--on-surface-variant)]">
            Each unmatched source name becomes a teacher (or links to an existing one). Resolving
            backfills that source&apos;s records.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--brand-border)]" style={{ backgroundColor: "var(--brand-header-tint)" }}>
                <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--on-surface-variant)]">Source name</th>
                <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--on-surface-variant)]">Will create</th>
                <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--on-surface-variant)]">School</th>
                <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--on-surface-variant)]">Records</th>
                <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--on-surface-variant)]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--brand-border)]">
              {items.map((item) => (
                <tr key={item.id} className="align-middle">
                  <td className="px-4 py-3 text-[13px] text-[var(--on-surface-variant)]">{item.raw_identifier}</td>
                  <td className="px-4 py-3 text-[13px] font-semibold">{item.suggested_name}</td>
                  <td className="px-4 py-3 text-[13px]">{item.detected_school_name ?? "—"}</td>
                  <td className="px-4 py-3 text-[13px]">{item.fact_rows ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={createTeacherFromQueue}>
                        <input type="hidden" name="queue_id" value={item.id} />
                        <button type="submit" className={BTN}>Create teacher</button>
                      </form>
                      <form action={linkQueueToExisting} className="inline-flex items-center gap-1">
                        <input type="hidden" name="queue_id" value={item.id} />
                        <select name="person_id" defaultValue="" className={SELECT} aria-label="Link to existing teacher">
                          <option value="" disabled>Link to existing…</option>
                          {people.map((p) => (
                            <option key={p.id} value={p.id}>{p.teacher_name ?? `#${p.id}`}</option>
                          ))}
                        </select>
                        <button type="submit" className={BTN_SECONDARY}>Link</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--on-surface-variant)]">
                    No pending matches. Everything is resolved. 🎉
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
