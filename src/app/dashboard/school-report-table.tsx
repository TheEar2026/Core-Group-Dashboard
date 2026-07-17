"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/brand";

export type SchoolReportRow = {
  school_id: number;
  school_name: string;
  drived_users: number | string | null;
  drived_invited: number | string | null;
  drived_accepted: number | string | null;
  drived_logged: number | string | null;
  drived_studied: number | string | null;
  drived_latest_snapshot_date: string | null;
  product_fruits_active_users: number | string | null;
  product_fruits_teachers: number | string | null;
  product_fruits_admins: number | string | null;
  product_fruits_last_activity: string | null;
  lms_course_rows: number | string | null;
  total_lessons_completed: number | string | null;
  total_lessons_assigned: number | string | null;
  lms_avg_completion_pct: number | string | null;
};

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? null : n;
}

function compact(n: number): string {
  if (Math.abs(n) >= 1000)
    return n.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
  return n.toLocaleString();
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

type SortKey = "school_name" | "drived_users" | "product_fruits_active_users" | "lms_avg_completion_pct";
type View = "cards" | "table";

export function SchoolReportTable({ rows }: { rows: SchoolReportRow[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("drived_users");
  const [asc, setAsc] = useState(false);
  const [view, setView] = useState<View>("cards");

  const totals = useMemo(() => {
    const users = rows.reduce((s, r) => s + (num(r.drived_users) ?? 0), 0);
    const active = rows.reduce((s, r) => s + (num(r.product_fruits_active_users) ?? 0), 0);
    const teachers = rows.reduce((s, r) => s + (num(r.product_fruits_teachers) ?? 0), 0);
    const admins = rows.reduce((s, r) => s + (num(r.product_fruits_admins) ?? 0), 0);
    const done = rows.reduce((s, r) => s + (num(r.total_lessons_completed) ?? 0), 0);
    const assigned = rows.reduce((s, r) => s + (num(r.total_lessons_assigned) ?? 0), 0);
    const completion = assigned > 0 ? Math.round((done / assigned) * 100) : null;
    return { users, active, teachers, admins, done, assigned, completion };
  }, [rows]);

  const maxUsers = useMemo(() => Math.max(1, ...rows.map((r) => num(r.drived_users) ?? 0)), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? rows.filter((r) => r.school_name.toLowerCase().includes(q)) : rows.slice();
    base.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (sortKey === "school_name") {
        av = a.school_name.toLowerCase();
        bv = b.school_name.toLowerCase();
      } else {
        av = num(a[sortKey]) ?? -1;
        bv = num(b[sortKey]) ?? -1;
      }
      if (av < bv) return asc ? -1 : 1;
      if (av > bv) return asc ? 1 : -1;
      return 0;
    });
    return base;
  }, [rows, query, sortKey, asc]);

  const latestSnapshot = useMemo(
    () => rows.map((r) => r.drived_latest_snapshot_date).filter(Boolean).sort().at(-1) ?? null,
    [rows],
  );

  function toggleSort(key: SortKey) {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(key === "school_name");
    }
  }

  function exportCsv() {
    const headers = [
      "School", "Drived users", "Invited", "Accepted", "Logged in", "Studied",
      "PF active users", "PF teachers", "PF admins", "PF last activity",
      "LMS courses", "Lessons completed", "Lessons assigned", "LMS completion %",
    ];
    const cell = (v: number | string | null | undefined) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of filtered) {
      lines.push(
        [
          r.school_name, num(r.drived_users) ?? "", num(r.drived_invited) ?? "", num(r.drived_accepted) ?? "",
          num(r.drived_logged) ?? "", num(r.drived_studied) ?? "",
          num(r.product_fruits_active_users) ?? "", num(r.product_fruits_teachers) ?? "",
          num(r.product_fruits_admins) ?? "", r.product_fruits_last_activity ?? "",
          num(r.lms_course_rows) ?? "", num(r.total_lessons_completed) ?? "",
          num(r.total_lessons_assigned) ?? "", num(r.lms_avg_completion_pct) ?? "",
        ].map(cell).join(","),
      );
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `school-report-${latestSnapshot ?? new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Schools" value={rows.length.toLocaleString()} hint="Core Group" />
        <Kpi label="Total users" value={compact(totals.users)} hint="Drived, all schools" />
        <Kpi
          label="Active users"
          value={compact(totals.active)}
          hint={`${totals.teachers.toLocaleString()} teachers · ${totals.admins.toLocaleString()} admins`}
        />
        <Kpi
          label="Avg completion"
          value={totals.completion === null ? "—" : `${totals.completion}%`}
          hint={totals.assigned > 0 ? `${compact(totals.done)} of ${compact(totals.assigned)} lessons` : "No LMS data yet"}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search schools"
          className="w-full max-w-xs rounded-lg border border-[var(--brand-border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none transition-all focus:border-[var(--brand-gold)] focus:shadow-[0_0_0_2px_rgba(168,136,76,0.15)]"
        />
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-[var(--brand-border)] bg-[var(--surface)] p-0.5">
            {(["cards", "table"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className="rounded-md px-3 py-1.5 text-[13px] font-semibold capitalize transition-colors"
                style={
                  view === v
                    ? { backgroundColor: "color-mix(in srgb, var(--brand-gold) 15%, transparent)", color: "var(--brand-gold)" }
                    : { color: "var(--on-surface-variant)" }
                }
              >
                {v}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-gold)] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[var(--brand-gold-hover)] active:scale-[0.98]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--brand-border)] bg-[var(--surface)] p-12 text-center text-sm text-[var(--on-surface-variant)]">
          No schools match “{query}”.
        </div>
      ) : view === "cards" ? (
        <SchoolCards rows={filtered} maxUsers={maxUsers} />
      ) : (
        <DataTable rows={filtered} maxUsers={maxUsers} sortKey={sortKey} asc={asc} toggleSort={toggleSort} />
      )}

      <p className="text-[13px] text-[var(--on-surface-variant)]">
        Showing {filtered.length} of {rows.length} {rows.length === 1 ? "school" : "schools"} · Data as of{" "}
        {fmtDate(latestSnapshot)}
      </p>
    </div>
  );
}

/* ---------------- Card view ---------------- */

function SchoolCards({ rows, maxUsers }: { rows: SchoolReportRow[]; maxUsers: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => (
        <SchoolCard key={r.school_id} r={r} maxUsers={maxUsers} />
      ))}
    </div>
  );
}

function SchoolCard({ r, maxUsers }: { r: SchoolReportRow; maxUsers: number }) {
  const users = num(r.drived_users);
  const active = num(r.product_fruits_active_users);
  const completion = num(r.lms_avg_completion_pct);
  const done = num(r.total_lessons_completed);
  const assigned = num(r.total_lessons_assigned);
  const loggedIn = num(r.drived_logged);
  const share = Math.round(((users ?? 0) / maxUsers) * 100);
  const initial = r.school_name.trim().charAt(0).toUpperCase() || "?";

  return (
    <Link
      href={`/schools/${r.school_id}`}
      className="group block rounded-2xl border border-[var(--brand-border)] bg-[var(--surface)] p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--brand-gold)] hover:shadow-md"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
          style={{ color: "var(--brand-gold)", backgroundColor: "color-mix(in srgb, var(--brand-gold) 14%, transparent)" }}
          aria-hidden
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold group-hover:text-[var(--brand-gold)]">{r.school_name}</p>
          <p className="text-[12px] text-[var(--on-surface-variant)]">
            {loggedIn ? `${loggedIn.toLocaleString()} logged in` : "Drived tenant"}
          </p>
        </div>
        <span className="text-[var(--on-surface-variant)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--brand-gold)]" aria-hidden>
          →
        </span>
      </div>

      {/* Hero metric */}
      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Total users</span>
          <span className="text-[26px] font-bold leading-none tracking-[-0.02em]">
            {users === null ? "—" : users.toLocaleString()}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--brand-header-tint)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, backgroundColor: "var(--brand-gold)" }} />
        </div>
      </div>

      {/* Footer mini-stats */}
      <div className="mt-5 grid grid-cols-3 gap-2 border-t border-[var(--brand-border)] pt-4">
        <MiniStat label="Active" value={active === null ? "—" : active.toLocaleString()} muted={!active} />
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">Completion</p>
          <div className="mt-1.5 flex justify-center">
            {completion === null ? (
              <span className="text-[15px] font-semibold text-[var(--on-surface-variant)] opacity-55">—</span>
            ) : (
              <StatusBadge value={completion} />
            )}
          </div>
        </div>
        <MiniStat
          label="Lessons"
          value={done === null && assigned === null ? "—" : `${(done ?? 0).toLocaleString()}/${(assigned ?? 0).toLocaleString()}`}
          muted={!done && !assigned}
        />
      </div>
    </Link>
  );
}

function MiniStat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">{label}</p>
      <p
        className="mt-1.5 text-[15px] font-semibold tabular-nums"
        style={muted ? { color: "var(--on-surface-variant)", opacity: 0.55 } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

/* ---------------- Table view ---------------- */

const TH =
  "px-4 py-3 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--on-surface-variant)] whitespace-nowrap";
const GROUP = "px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] whitespace-nowrap";

/** Numeric cell that de-emphasises zeros and blanks so real values stand out. */
function Cell({ value }: { value: number | string | null | undefined }) {
  const n = num(value);
  const isQuiet = n === null || n === 0;
  return (
    <td
      className="px-4 py-3 text-right text-[13px] tabular-nums whitespace-nowrap"
      style={isQuiet ? { color: "var(--on-surface-variant)", opacity: 0.55 } : undefined}
    >
      {n === null ? "—" : n.toLocaleString()}
    </td>
  );
}

function DataTable({
  rows,
  maxUsers,
  sortKey,
  asc,
  toggleSort,
}: {
  rows: SchoolReportRow[];
  maxUsers: number;
  sortKey: SortKey;
  asc: boolean;
  toggleSort: (k: SortKey) => void;
}) {
  function SortArrow({ k }: { k: SortKey }) {
    const active = sortKey === k;
    return <span style={{ color: active ? "var(--brand-gold)" : "transparent" }}>{active && asc ? "▲" : "▼"}</span>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr style={{ backgroundColor: "var(--brand-header-tint)" }}>
              <th className="sticky left-0 z-20" style={{ backgroundColor: "var(--brand-header-tint)" }} />
              <th className={`${GROUP} text-left`} colSpan={5} style={{ color: "var(--brand-gold)" }}>Drived</th>
              <th className={`${GROUP} text-right`} colSpan={4} style={{ color: "var(--brand-gold)" }}>Product Fruits</th>
              <th className={`${GROUP} text-right`} colSpan={3} style={{ color: "var(--brand-gold)" }}>LMS</th>
            </tr>
            <tr className="border-b border-[var(--brand-border)]" style={{ backgroundColor: "var(--brand-header-tint)" }}>
              <th className={`sticky left-0 z-20 ${TH} text-left`} style={{ backgroundColor: "var(--brand-header-tint)", minWidth: "13rem" }}>
                <button type="button" onClick={() => toggleSort("school_name")} className="inline-flex items-center gap-1 hover:text-[var(--brand-gold)]">
                  School <SortArrow k="school_name" />
                </button>
              </th>
              <th className={`${TH} text-right`}>
                <button type="button" onClick={() => toggleSort("drived_users")} className="inline-flex items-center gap-1 hover:text-[var(--brand-gold)]">
                  Users <SortArrow k="drived_users" />
                </button>
              </th>
              <th className={`${TH} text-right`}>Invited</th>
              <th className={`${TH} text-right`}>Accepted</th>
              <th className={`${TH} text-right`}>Logged in</th>
              <th className={`${TH} text-right`}>Studied</th>
              <th className={`${TH} text-right`}>
                <button type="button" onClick={() => toggleSort("product_fruits_active_users")} className="inline-flex items-center gap-1 hover:text-[var(--brand-gold)]">
                  Active <SortArrow k="product_fruits_active_users" />
                </button>
              </th>
              <th className={`${TH} text-right`}>Teachers</th>
              <th className={`${TH} text-right`}>Admins</th>
              <th className={`${TH} text-right`}>Last activity</th>
              <th className={`${TH} text-right`}>Courses</th>
              <th className={`${TH} text-right`}>Lessons</th>
              <th className={`${TH} text-right`}>
                <button type="button" onClick={() => toggleSort("lms_avg_completion_pct")} className="inline-flex items-center gap-1 hover:text-[var(--brand-gold)]">
                  Completion <SortArrow k="lms_avg_completion_pct" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--brand-border)]">
            {rows.map((r) => {
              const users = num(r.drived_users);
              const lessonsDone = num(r.total_lessons_completed);
              const lessonsAssigned = num(r.total_lessons_assigned);
              return (
                <tr key={r.school_id} className="group transition-colors hover:bg-[var(--brand-bg)]">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-[var(--surface)] px-4 py-3 group-hover:bg-[var(--brand-bg)]" style={{ minWidth: "13rem" }}>
                    <Link href={`/schools/${r.school_id}`} className="text-[13px] font-semibold hover:underline" style={{ color: "var(--brand-gold)" }}>
                      {r.school_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right align-middle">
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[13px] font-semibold tabular-nums">{users === null ? "—" : users.toLocaleString()}</span>
                      <div className="h-1 w-16 overflow-hidden rounded-full" style={{ backgroundColor: "var(--brand-header-tint)" }}>
                        <div className="h-full rounded-full" style={{ width: `${((users ?? 0) / maxUsers) * 100}%`, backgroundColor: "var(--brand-gold)" }} />
                      </div>
                    </div>
                  </td>
                  <Cell value={r.drived_invited} />
                  <Cell value={r.drived_accepted} />
                  <Cell value={r.drived_logged} />
                  <Cell value={r.drived_studied} />
                  <Cell value={r.product_fruits_active_users} />
                  <Cell value={r.product_fruits_teachers} />
                  <Cell value={r.product_fruits_admins} />
                  <td className="px-4 py-3 text-right text-[13px] whitespace-nowrap" style={{ color: "var(--on-surface-variant)" }}>
                    {fmtDate(r.product_fruits_last_activity)}
                  </td>
                  <Cell value={r.lms_course_rows} />
                  <td className="px-4 py-3 text-right text-[13px] tabular-nums whitespace-nowrap">
                    {lessonsDone === null && lessonsAssigned === null ? (
                      <span style={{ color: "var(--on-surface-variant)", opacity: 0.55 }}>—</span>
                    ) : (
                      <>
                        <span className={lessonsDone ? "" : "opacity-55"}>{(lessonsDone ?? 0).toLocaleString()}</span>
                        <span style={{ color: "var(--on-surface-variant)" }}> / {(lessonsAssigned ?? 0).toLocaleString()}</span>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <StatusBadge value={num(r.lms_avg_completion_pct)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-5 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">{label}</p>
      <p className="mt-2 text-[28px] font-bold leading-none tracking-[-0.02em]">{value}</p>
      {hint && <p className="mt-2 text-[12px] text-[var(--on-surface-variant)]">{hint}</p>}
    </div>
  );
}
